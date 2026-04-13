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

app.get("/", (c) => {
  return c.html(`<!DOCTYPE html>
<html><head><title>MealViewer Bridge</title></head>
<body style="font-family:system-ui;max-width:600px;margin:2rem auto;padding:0 1rem">
<h1>MealViewer Bridge</h1>
<p>Expose school meal menus as calendar feeds and APIs.</p>

<h2>Endpoints</h2>
<h3>ICS Calendar Feed</h3>
<code>GET /feed/{schoolId}.ics?meal=Lunch|Breakfast|all</code>
<p>Subscribe to this URL in your calendar app.</p>

<h3>JSON API</h3>
<code>GET /api/{schoolId}?meal=Lunch&range=week|month</code>

<h3>Markdown</h3>
<code>GET /menu/{schoolId}.md?meal=Lunch&range=week|month</code>
<p>AI-agent friendly format.</p>

<h2>Example</h2>
<ul>
<li><a href="/feed/EmilyDickinsonElementarySchool.ics">/feed/EmilyDickinsonElementarySchool.ics</a></li>
<li><a href="/api/EmilyDickinsonElementarySchool">/api/EmilyDickinsonElementarySchool</a></li>
<li><a href="/menu/EmilyDickinsonElementarySchool.md">/menu/EmilyDickinsonElementarySchool.md</a></li>
</ul>
</body></html>`);
});

export default app;
