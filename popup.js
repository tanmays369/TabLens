const api = typeof browser !== "undefined" ? browser : chrome;

const els = {
  tabsList: document.getElementById("tabs-list"),
  tabCount: document.getElementById("tab-count"),
  statusPill: document.getElementById("status-pill"),
  refreshBtn: document.getElementById("refresh-btn"),
  template: document.getElementById("tab-item-template"),
};

const cardRegistry = new Map();

function setStatus(state, text) {
  els.statusPill.className = `stat-pill status-${state}`;
  els.statusPill.textContent = text;
}

function getDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function faviconFor(tab) {
  if (tab.favIconUrl && !tab.favIconUrl.startsWith("chrome://")) {
    return tab.favIconUrl;
  }
  const domain = getDomain(tab.url);
  if (!domain) return "";
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function renderEmpty() {
  els.tabsList.innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 3h18v4H3zm0 6h18v12H3z" stroke="currentColor" stroke-width="1.5" fill="none"/>
      </svg>
      <h2>No summarizable tabs</h2>
      <p>Open some web pages and try again.</p>
    </div>
  `;
}

function createTabCard(tab) {
  const node = els.template.content.firstElementChild.cloneNode(true);
  const img = node.querySelector(".tab-favicon img");
  const title = node.querySelector(".tab-title");
  const domain = node.querySelector(".tab-domain");
  const openBtn = node.querySelector(".tab-open");

  img.src = faviconFor(tab);
  img.onerror = () => { img.style.display = "none"; };
  title.textContent = tab.title || "Untitled";
  title.title = tab.title || "";
  domain.textContent = getDomain(tab.url);

  const switchTo = async (e) => {
    if (e) e.stopPropagation();
    await api.tabs.update(tab.id, { active: true });
    const t = await api.tabs.get(tab.id);
    if (t.windowId) await api.windows.update(t.windowId, { focused: true });
    window.close();
  };

  openBtn.addEventListener("click", switchTo);
  node.addEventListener("click", switchTo);

  cardRegistry.set(tab.id, node);
  els.tabsList.appendChild(node);
  return node;
}

function updateCardSummary(tabId, summary, isError = false) {
  const card = cardRegistry.get(tabId);
  if (!card) return;
  const summaryEl = card.querySelector(".tab-summary");
  summaryEl.classList.toggle("error", isError);
  summaryEl.innerHTML = "";
  summaryEl.textContent = summary;
}

function isSummarizable(tab) {
  if (!tab.url) return false;
  return /^https?:\/\//i.test(tab.url) || /^file:\/\//i.test(tab.url);
}

async function loadTabs() {
  const tabs = await api.tabs.query({});
  const summarizable = tabs.filter(isSummarizable);
  els.tabCount.textContent = `${summarizable.length} tab${summarizable.length === 1 ? "" : "s"}`;

  cardRegistry.clear();
  els.tabsList.innerHTML = "";

  if (summarizable.length === 0) {
    renderEmpty();
    return [];
  }

  summarizable.forEach(createTabCard);
  return summarizable;
}

async function runSummarization() {
  const tabs = await loadTabs();
  if (tabs.length === 0) {
    setStatus("idle", "Nothing to summarize");
    return;
  }

  els.refreshBtn.disabled = true;
  setStatus("working", `Summarizing ${tabs.length}…`);

  let completed = 0;
  let failed = 0;

  await Promise.all(
    tabs.map(async (tab) => {
      try {
        const response = await api.runtime.sendMessage({
          type: "SUMMARIZE_TAB",
          tabId: tab.id,
        });
        if (response?.ok) {
          updateCardSummary(tab.id, response.summary);
        } else {
          updateCardSummary(tab.id, response?.error || "Couldn't summarize this tab.", true);
          failed++;
        }
      } catch (err) {
        updateCardSummary(tab.id, err.message || "Unexpected error.", true);
        failed++;
      } finally {
        completed++;
        setStatus("working", `Summarizing ${completed}/${tabs.length}…`);
      }
    })
  );

  els.refreshBtn.disabled = false;
  if (failed === 0) {
    setStatus("done", "All caught up");
  } else if (failed === tabs.length) {
    setStatus("error", "All failed");
  } else {
    setStatus("done", `${tabs.length - failed}/${tabs.length} done`);
  }
}

els.refreshBtn.addEventListener("click", runSummarization);

(async function init() {
  await runSummarization();
})();
