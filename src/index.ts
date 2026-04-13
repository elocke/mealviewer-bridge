import { Hono } from "hono";
import { cache } from "hono/cache";
import {
  fetchMealViewerRaw,
  transformToClean,
  getDefaultDateRange,
  getWeekDateRange,
} from "./mealviewer";
import { generateICS } from "./ics";
import { generateMarkdown } from "./markdown";
import type { MealType } from "./types";

const app = new Hono();

function parseMealParam(meal?: string | null): MealType | undefined {
  if (!meal || meal === "all") return undefined;
  if (meal === "Breakfast" || meal === "breakfast") return "Breakfast";
  return "Lunch";
}

// ICS feed — 30-day window, 1-hour edge cache
app.get(
  "/feed/:schoolId{.+\\.ics$}",
  cache({ cacheName: "ics-feeds", cacheControl: "public, max-age=3600" }),
  async (c) => {
    const schoolId = c.req.param("schoolId")!.replace(/\.ics$/, "");
    const mealFilter = parseMealParam(c.req.query("meal"));

    try {
      const { start, end } = getDefaultDateRange();
      const raw = await fetchMealViewerRaw(schoolId, start, end);
      const clean = transformToClean(raw, mealFilter);
      const ics = generateICS(clean, mealFilter);

      return new Response(ics, {
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `inline; filename="${schoolId}.ics"`,
        },
      });
    } catch (e) {
      return c.text(`Error fetching menu: ${e instanceof Error ? e.message : "Unknown error"}`, 502);
    }
  }
);

// JSON API — current week by default, 30-min edge cache
app.get(
  "/api/:schoolId",
  cache({ cacheName: "api-json", cacheControl: "public, max-age=1800" }),
  async (c) => {
    const schoolId = c.req.param("schoolId")!;
    const mealFilter = parseMealParam(c.req.query("meal"));
    const range = c.req.query("range") === "month" ? getDefaultDateRange() : getWeekDateRange();

    try {
      const raw = await fetchMealViewerRaw(schoolId, range.start, range.end);
      const clean = transformToClean(raw, mealFilter);
      return c.json(clean);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "Unknown error" }, 502);
    }
  }
);

// Markdown — for AI agents, 30-min edge cache
app.get(
  "/menu/:schoolId{.+\\.md$}",
  cache({ cacheName: "api-md", cacheControl: "public, max-age=1800" }),
  async (c) => {
    const schoolId = c.req.param("schoolId")!.replace(/\.md$/, "");
    const mealFilter = parseMealParam(c.req.query("meal"));
    const range = c.req.query("range") === "month" ? getDefaultDateRange() : getWeekDateRange();

    try {
      const raw = await fetchMealViewerRaw(schoolId, range.start, range.end);
      const clean = transformToClean(raw, mealFilter);
      const md = generateMarkdown(clean, mealFilter);
      return new Response(md, {
        headers: { "Content-Type": "text/markdown; charset=utf-8" },
      });
    } catch (e) {
      return c.text(`Error: ${e instanceof Error ? e.message : "Unknown error"}`, 502);
    }
  }
);

// School search — proxies MealViewer's search API
app.get("/search", async (c) => {
  const q = c.req.query("q");
  if (!q || q.length < 2) {
    return c.json([]);
  }
  try {
    const res = await fetch(
      `https://api.mealviewer.com/api/v4/physicalLocation/search/${encodeURIComponent(q)}`
    );
    const json = (await res.json()) as { data?: { name: string; city: string; state: string; physicalLocationLookup: string }[] };
    const results = (json.data ?? []).map((s) => ({
      name: s.name,
      city: s.city,
      state: s.state,
      id: s.physicalLocationLookup,
    }));
    return c.json(results);
  } catch {
    return c.json([], 502);
  }
});

app.get("/", (c) => {
  const host = c.req.header("host") ?? "mealviewer-bridge.wishicould.dev";
  return c.html(landingPage(host));
});

function landingPage(host: string): string {
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MealViewer Bridge — School Lunch Calendar</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #1a1a1a; line-height: 1.6; background: #f8f9fa; }
  .container { max-width: 640px; margin: 0 auto; padding: 2rem 1rem; }
  h1 { font-size: 1.75rem; margin-bottom: 0.25rem; }
  .subtitle { color: #666; margin-bottom: 2rem; }
  h2 { font-size: 1.25rem; margin: 2rem 0 0.75rem; border-bottom: 2px solid #e0e0e0; padding-bottom: 0.25rem; }
  h3 { font-size: 1rem; margin: 1.25rem 0 0.5rem; color: #333; }

  /* Search */
  .search-box { position: relative; margin-bottom: 0.5rem; }
  .search-box input {
    width: 100%; padding: 0.75rem 1rem; font-size: 1rem;
    border: 2px solid #ddd; border-radius: 8px; outline: none;
    transition: border-color 0.2s;
  }
  .search-box input:focus { border-color: #4a90d9; }
  .results {
    border: 1px solid #ddd; border-radius: 8px; background: #fff;
    display: none; max-height: 240px; overflow-y: auto;
  }
  .results.visible { display: block; }
  .result-item {
    padding: 0.6rem 1rem; cursor: pointer; border-bottom: 1px solid #f0f0f0;
  }
  .result-item:last-child { border-bottom: none; }
  .result-item:hover { background: #f0f6ff; }
  .result-name { font-weight: 600; }
  .result-loc { font-size: 0.85rem; color: #666; }
  .no-results { padding: 0.75rem 1rem; color: #999; font-style: italic; }

  /* Feed URLs */
  .feed-section { display: none; background: #e8f5e9; border-radius: 8px; padding: 1rem 1.25rem; margin-top: 1rem; }
  .feed-section.visible { display: block; }
  .feed-section h3 { margin-top: 0; color: #2e7d32; }
  .feed-url {
    display: flex; align-items: center; gap: 0.5rem; margin: 0.4rem 0;
    background: #fff; border: 1px solid #c8e6c9; border-radius: 6px; padding: 0.4rem 0.75rem;
  }
  .feed-url code { flex: 1; font-size: 0.8rem; word-break: break-all; }
  .feed-url button {
    padding: 0.3rem 0.6rem; font-size: 0.75rem; cursor: pointer;
    border: 1px solid #aaa; border-radius: 4px; background: #fff;
    white-space: nowrap;
  }
  .feed-url button:hover { background: #f0f0f0; }
  .feed-url button.copied { background: #4caf50; color: #fff; border-color: #4caf50; }
  .feed-label { font-size: 0.85rem; font-weight: 600; margin-top: 0.5rem; }

  /* How-to */
  .steps { counter-reset: step; }
  .step { padding: 0.5rem 0 0.5rem 2.5rem; position: relative; }
  .step::before {
    counter-increment: step; content: counter(step);
    position: absolute; left: 0; top: 0.5rem;
    width: 1.75rem; height: 1.75rem; border-radius: 50%;
    background: #4a90d9; color: #fff; font-weight: 700; font-size: 0.85rem;
    display: flex; align-items: center; justify-content: center;
  }
  .tip { background: #fff3cd; border-radius: 6px; padding: 0.6rem 0.75rem; margin: 0.75rem 0; font-size: 0.9rem; }
  .api-section { margin-top: 1.5rem; padding: 1rem; background: #fff; border-radius: 8px; border: 1px solid #e0e0e0; }
  .api-section code { background: #f5f5f5; padding: 0.15rem 0.4rem; border-radius: 3px; font-size: 0.85rem; }
  footer { margin-top: 2.5rem; text-align: center; color: #999; font-size: 0.8rem; }
</style>
</head>
<body>
<div class="container">

<h1>MealViewer Bridge</h1>
<p class="subtitle">Get your school's lunch menu in your calendar app. No more checking the website every day.</p>

<h2>1. Find Your School</h2>
<div class="search-box">
  <input type="text" id="search" placeholder="Start typing your school name..." autocomplete="off">
</div>
<div class="results" id="results"></div>

<div class="feed-section" id="feeds">
  <h3 id="school-name"></h3>
  <p class="feed-label">Lunch Calendar</p>
  <div class="feed-url">
    <code id="lunch-url"></code>
    <button onclick="copyUrl('lunch-url', this)">Copy</button>
  </div>
  <p class="feed-label">Breakfast Calendar</p>
  <div class="feed-url">
    <code id="breakfast-url"></code>
    <button onclick="copyUrl('breakfast-url', this)">Copy</button>
  </div>
</div>

<h2>2. Add to Your Calendar</h2>

<h3>Apple Calendar (iPhone / Mac)</h3>
<div class="steps">
  <div class="step">Copy the Lunch or Breakfast URL above</div>
  <div class="step"><b>On iPhone:</b> Go to <b>Settings &rarr; Calendar &rarr; Accounts &rarr; Add Account &rarr; Other &rarr; Add Subscribed Calendar</b></div>
  <div class="step">Paste the URL and tap <b>Next</b>, then <b>Save</b></div>
</div>
<div class="tip">On Mac: Open Calendar, click <b>File &rarr; New Calendar Subscription</b>, paste the URL.</div>

<h3>Google Calendar</h3>
<div class="steps">
  <div class="step">Copy the URL above</div>
  <div class="step">Open <b>Google Calendar</b> on a computer (not the phone app)</div>
  <div class="step">Click the <b>+</b> next to "Other calendars" in the left sidebar</div>
  <div class="step">Choose <b>From URL</b>, paste the link, and click <b>Add calendar</b></div>
</div>
<div class="tip">Google Calendar can take up to 24 hours to show updates. This is a Google limitation, not a bug.</div>

<h3>Outlook</h3>
<div class="steps">
  <div class="step">Copy the URL above</div>
  <div class="step">Open Outlook and go to <b>Calendar</b></div>
  <div class="step">Click <b>Add calendar &rarr; Subscribe from web</b></div>
  <div class="step">Paste the URL and give it a name like "School Lunch"</div>
</div>

<div class="api-section">
  <h3>For Developers</h3>
  <p>There's also a JSON API and Markdown endpoint:</p>
  <p><code>GET /api/{schoolId}?meal=Lunch&amp;range=week|month</code></p>
  <p><code>GET /menu/{schoolId}.md?meal=Lunch&amp;range=week|month</code></p>
  <p style="margin-top:0.5rem; font-size:0.85rem; color:#666">The Markdown endpoint is great for AI agents and Claude skills.</p>
</div>

<footer>
  <p>MealViewer Bridge is open source. Data provided by <a href="https://www.mealviewer.com">MealViewer</a>.</p>
</footer>

</div>

<script>
const host = ${JSON.stringify(host)};

let debounce;
document.getElementById('search').addEventListener('input', function() {
  clearTimeout(debounce);
  const q = this.value.trim();
  if (q.length < 2) { hide('results'); return; }
  debounce = setTimeout(() => doSearch(q), 250);
});

async function doSearch(q) {
  try {
    const res = await fetch('/search?q=' + encodeURIComponent(q));
    const data = await res.json();
    const el = document.getElementById('results');
    if (data.length === 0) {
      el.innerHTML = '<div class="no-results">No schools found. Try a different name.</div>';
    } else {
      el.innerHTML = data.map(s =>
        '<div class="result-item" onclick="selectSchool(\\'' + s.id + '\\',\\'' + esc(s.name) + '\\')">' +
        '<div class="result-name">' + esc(s.name) + '</div>' +
        '<div class="result-loc">' + esc(s.city) + ', ' + esc(s.state) + '</div>' +
        '</div>'
      ).join('');
    }
    show('results');
  } catch {}
}

function selectSchool(id, name) {
  hide('results');
  document.getElementById('search').value = name;
  document.getElementById('school-name').textContent = name;
  const base = 'https://' + host + '/feed/' + id + '.ics';
  document.getElementById('lunch-url').textContent = base + '?meal=Lunch';
  document.getElementById('breakfast-url').textContent = base + '?meal=Breakfast';
  show('feeds');
  document.getElementById('feeds').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function copyUrl(elId, btn) {
  const text = document.getElementById(elId).textContent;
  navigator.clipboard.writeText(text).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
function show(id) { document.getElementById(id).classList.add('visible'); }
function hide(id) { document.getElementById(id).classList.remove('visible'); }
</script>
</body></html>`;
}

export default app;
