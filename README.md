# TabLens

Youtube link: https://youtu.be/7Bm1v3G9xG8

A beautiful, truly zero-config Firefox extension that reads every open tab and summarizes each one in 1–2 sentences.

Just install and click.

![TabLens](icons/icon-128.png)

## Features

- **All-tabs overview** — one click, every open tab gets a concise summary.
- **Zero configuration** — nothing to install, sign up for, or paste anywhere.
- **Beautiful UI** — dark/light adaptive theme, shimmer loading states, smooth animations.
- **Click-to-switch** — tap any card to jump straight to that tab.
- **Smart extraction** — pulls the cleanest representation of each page (title, headings, main content) so summaries are meaningful.
- **In-memory cache** — recently summarized tabs don't re-hit the API for 5 minutes; invalidated automatically on navigation.
- **Private** — page content only leaves your browser when you press Summarize, and only to `text.pollinations.ai`. No telemetry.

## Install (development)

1. Open Firefox → `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `manifest.json` from this folder
4. Click the TabLens icon in your toolbar → **Summarize**

For a permanent install, the package must be signed via [addons.mozilla.org](https://addons.mozilla.org).

## Repo structure (flat)

```
manifest.json        MV3 manifest (Firefox 115+)
background.js        LLM orchestration, content extraction, caching
popup.html           Popup markup
popup.css            Popup styling (dark/light, animations)
popup.js             Popup logic
icons/               16/32/48/128 PNG icons
  generate_icons.py  Script used to regenerate them
README.md
```

## How summaries are generated

1. The popup calls `tabs.query({})` and filters to `http(s):` / `file:` URLs.
2. For each tab, the background script injects a small extractor via `scripting.executeScript` that returns the title, meta description, `og:` tags, h1–h3 headings, and ~4 KB of cleaned main-content text.
3. That payload is wrapped in a short prompt ("1–2 sentences, ~30 words, crisp, no boilerplate") and POSTed to `https://text.pollinations.ai/`.
4. The summary is rendered into its card in the popup with a smooth animation.

## Privacy

- Nothing leaves your browser until you press **Summarize**.
- Outbound traffic goes **only** to `https://text.pollinations.ai/`.
- No analytics, telemetry, or third-party servers beyond the LLM call.
- We send `private: true` in each request so Pollinations does not publish or cache your prompts on their public feeds.

## License

MIT
