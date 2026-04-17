const api = typeof browser !== "undefined" ? browser : chrome;

const POLLINATIONS_ENDPOINT = "https://text.pollinations.ai/";
const MODEL = "openai";

const summaryCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

function truncate(text, max) {
  if (!text) return "";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function buildPrompt(pageData) {
  const parts = [
    `Title: ${truncate(pageData.title, 200)}`,
    pageData.siteName ? `Site: ${truncate(pageData.siteName, 80)}` : "",
    `URL: ${truncate(pageData.url, 200)}`,
    pageData.description ? `Description: ${truncate(pageData.description, 400)}` : "",
    pageData.headings && pageData.headings.length
      ? `Headings: ${pageData.headings.join(" | ")}`
      : "",
    pageData.body ? `Content excerpt:\n${truncate(pageData.body, 3000)}` : "",
  ].filter(Boolean);

  return `You are a concise summarizer of browser tabs. In 1 to 2 short sentences (max ~30 words total), describe what the user is doing or reading on this tab. Focus on the actual content or activity, not generic descriptions. Do not start with "This tab" or "The user is". Write in a crisp, informative tone. Return only the summary text, no quotes, no markdown.

Tab data:
${parts.join("\n")}`;
}

function pageExtractorFn() {
  function getMeta(name) {
    const el =
      document.querySelector(`meta[name="${name}"]`) ||
      document.querySelector(`meta[property="${name}"]`);
    return el ? el.getAttribute("content") || "" : "";
  }
  function clean(text) {
    return (text || "").replace(/\s+/g, " ").replace(/\u00a0/g, " ").trim();
  }
  function mainText() {
    const candidates = [
      document.querySelector("main"),
      document.querySelector("article"),
      document.querySelector('[role="main"]'),
      document.querySelector("#content"),
      document.querySelector(".content"),
      document.body,
    ].filter(Boolean);
    const root = candidates[0] || document.body;
    if (!root) return "";
    const clone = root.cloneNode(true);
    clone
      .querySelectorAll(
        "script, style, noscript, nav, footer, header, aside, iframe, svg, form, [aria-hidden='true']"
      )
      .forEach((n) => n.remove());
    return clean(clone.innerText || clone.textContent || "").slice(0, 4000);
  }
  const headings = Array.from(document.querySelectorAll("h1, h2, h3"))
    .map((h) => clean(h.innerText || h.textContent || ""))
    .filter(Boolean)
    .slice(0, 8);
  return {
    title: document.title || "",
    url: location.href,
    description: getMeta("description") || getMeta("og:description") || "",
    siteName: getMeta("og:site_name") || "",
    headings,
    body: mainText(),
  };
}

async function extractTabContent(tabId) {
  const results = await api.scripting.executeScript({
    target: { tabId },
    func: pageExtractorFn,
  });
  if (!results || !results.length || !results[0].result) {
    throw new Error("Could not read this page.");
  }
  return results[0].result;
}

async function callLLM(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  let res;
  try {
    res = await fetch(POLLINATIONS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content:
              "You summarize browser tabs in 1–2 crisp sentences (~30 words). Output only the summary.",
          },
          { role: "user", content: prompt },
        ],
        model: MODEL,
        private: true,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new Error("Request timed out.");
    throw new Error("Network error. Check your connection.");
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    if (res.status === 429) throw new Error("Rate limited — try again shortly.");
    if (res.status >= 500) throw new Error("LLM service is busy, try again.");
    throw new Error(`LLM error (${res.status}).`);
  }

  const contentType = res.headers.get("content-type") || "";
  let text = "";
  if (contentType.includes("application/json")) {
    const data = await res.json();
    text =
      data?.choices?.[0]?.message?.content ||
      data?.response ||
      data?.text ||
      (typeof data === "string" ? data : "");
  } else {
    text = await res.text();
  }

  const cleaned = text
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ");
  if (!cleaned) throw new Error("Empty response from LLM.");
  return cleaned;
}

function cacheKey(tabId, url) {
  return `${tabId}::${url}`;
}

async function summarizeTab(tabId) {
  const tab = await api.tabs.get(tabId);
  if (!tab || !tab.url) throw new Error("Tab unavailable.");
  if (!/^https?:|^file:/i.test(tab.url)) {
    throw new Error("Can't read this page type.");
  }

  const key = cacheKey(tabId, tab.url);
  const cached = summaryCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.summary;
  }

  const pageData = await extractTabContent(tabId);

  if (!pageData || (!pageData.body && !pageData.description && !pageData.title)) {
    throw new Error("No readable content on this page.");
  }

  const prompt = buildPrompt(pageData);
  const summary = await callLLM(prompt);
  summaryCache.set(key, { summary, at: Date.now() });
  return summary;
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "SUMMARIZE_TAB") {
    summarizeTab(message.tabId)
      .then((summary) => sendResponse({ ok: true, summary }))
      .catch((err) => sendResponse({ ok: false, error: err.message || String(err) }));
    return true;
  }
});

api.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    for (const key of summaryCache.keys()) {
      if (key.startsWith(`${tabId}::`)) summaryCache.delete(key);
    }
  }
});

api.tabs.onRemoved.addListener((tabId) => {
  for (const key of summaryCache.keys()) {
    if (key.startsWith(`${tabId}::`)) summaryCache.delete(key);
  }
});
