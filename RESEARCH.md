# MealViewer Bridge — Research Report

## 1. MealViewer API

### 1.1 Endpoint

**Single endpoint, no authentication required.**

```
GET https://api.mealviewer.com/api/v4/school/{schoolName}/{startDate}/{endDate}/0
```

| Parameter | Format | Example |
|-----------|--------|---------|
| `schoolName` | CamelCase, no spaces | `EmilyDickinsonElementarySchool` |
| `startDate` | `MM-DD-YYYY` | `04-12-2026` |
| `endDate` | `MM-DD-YYYY` | `04-18-2026` |
| trailing `0` | Pagination offset | Always `0` |

The school identifier is extracted from the URL at `schools.mealviewer.com/school/{schoolName}`.

### 1.2 Response Structure (Verified Live)

```
Response Root
├── physicalLocation
│   ├── id: 17268
│   ├── name: "Emily Dickinson Elementary School"
│   ├── address: "2435 Annie St"
│   ├── city: "Bozeman"
│   ├── state: "Montana"
│   ├── zip: "59718"
│   ├── lat: 45.6899178
│   ├── long: -111.0693295
│   ├── schoolColor: "#6ca2cc"
│   ├── schoolLogo, schoolImage (paths)
│   └── locations[] (menu categories with id, name, blockType, orderId)
├── menuSchedules[]
│   ├── dateInformation
│   │   ├── dateKey: "20260413" (YYYYMMDD)
│   │   ├── dateFull: ISO timestamp
│   │   ├── weekDayName, monthName, monthDay, weekNumber, etc.
│   │   └── ...
│   └── menuBlocks[]
│       ├── blockName: "Breakfast" | "Lunch"
│       ├── id, scheduledDate
│       └── cafeteriaLineList
│           └── data[]
│               ├── name: "Daily Feature" | "Grab & Go" | "Offered Daily"
│               ├── id, object: "cafeteriaLine"
│               └── foodItemList
│                   └── data[]
│                       ├── item_Name: "MOZZARELLA BREAD STICKS"
│                       ├── item_AltName (optional)
│                       ├── item_Name_Line_2 (optional)
│                       ├── description (optional)
│                       ├── item_Type: "ENTREES" | "BREAKFAST" | "SNACKS" | ...
│                       ├── portionQuantity, portionSize, portionUnit
│                       ├── nutritionals[]
│                       │   └── { name, value, nutrientCode }
│                       │       (Calories, Total Fat, Sat Fat, Trans Fat,
│                       │        Cholesterol, Sodium, Total Carbs, Fiber,
│                       │        Sugars, Added Sugars, Protein, Vit A/C,
│                       │        Iron, Calcium, Ash, Water — 19+ nutrients)
│                       ├── allergens[]
│                       │   └── { codeName, name, value: "True"/"False" }
│                       │       (milk, egg, soy, wheat, peanut, treenut,
│                       │        corn, shellfish, fish)
│                       ├── badges[]
│                       │   └── { codeName: "locallyGrown", ... }
│                       └── imageFileName (optional)
├── externalLinks[] (e.g., donation links)
├── announcements[]
├── blackoutInformation
└── arCampaigns[]
```

### 1.3 Sample Data (Emily Dickinson Elementary, Week of 4/13/2026)

**Monday Breakfast:**
- ULTIMATE BREAKFAST ROUND (270 cal) — allergens: milk, egg, soy, wheat
- CEREAL (110 cal) — allergens: treenut, soy, wheat, corn
- STRING CHEESE (80 cal) — allergen: milk

**Monday Lunch:**
- MOZZARELLA BREAD STICKS (300 cal, 2 EACH) — milk, wheat
- MARINARA (45 cal, #16 SCOOP) — soy
- SUB SANDWICH (281 cal) — milk, soy, wheat
- PB & J SANDWICH (320 cal) — peanut, soy, wheat

**Tuesday Lunch:**
- SUPER NACHOS (375 cal) — locally grown badge (Montana beef), milk, corn
- BLACK BEANS (110 cal, 1/2 CUP)

**Wednesday Breakfast:**
- MINI MAPLE WAFFLES (190 cal) — egg, soy, wheat

---

## 2. Existing Implementations

### 2.1 BrandCast mealviewer-api-client

- **Repo:** github.com/BrandCast-Signage/mealviewer-api-client
- **npm:** `@brandcast_app/mealviewer-api-client`
- TypeScript client wrapping the single API endpoint
- Uses `axios`, converts dates to `MM-DD-YYYY`
- Full type definitions for request/response
- **Does NOT parse** nutrition or allergen data (comment says "if needed")
- Good reference for types but heavyweight dependency for a CF Worker

### 2.2 Meandmybadself/mealviewer-to-ICS

- **Repo:** github.com/Meandmybadself/mealviewer-to-ICS
- **Live:** mealcal.meandmybadself.com
- Cloudflare Worker using `ical-generator` v6
- Query params: `?schoolId=...&meal=Lunch|Breakfast`
- Fetches yesterday → yesterday+30 days
- **Known bugs:**
  1. HTML tags (`<b>`, `<br/>`) in ICS DESCRIPTION field — rendered as literal text in calendar apps
  2. `item_Name` and `item_Name_Line_2` concatenated without separator
  3. `schoolId` default makes the null check dead code
  4. Variable shadowing (`datum` used at two nesting levels)
  5. Test file is boilerplate (no actual ICS tests)
  6. Return value inside `.forEach` callback is wasted

### 2.3 MMM-MealViewer (MagicMirror module)

- github.com/KevinGlinski/MMM-MealViewer
- Same API pattern, config-based school selection
- Useful reference for display formatting

---

## 3. ICS Calendar Feed Best Practices

### 3.1 DESCRIPTION vs X-ALT-DESC

| Property | Standard | Content Type | Support |
|----------|----------|-------------|---------|
| `DESCRIPTION` | RFC 5545 | Plain text only | Universal |
| `X-ALT-DESC;FMTTYPE=text/html` | Non-standard (Microsoft) | HTML | Outlook, Nextcloud, partial Apple |

**Best practice:** Provide BOTH. Use `\n` for newlines in DESCRIPTION (never `<br/>`).

With `ical-generator`, pass an object to `description`:
```typescript
description: {
    plain: 'Chicken Nuggets\nGreen Beans\nFruit Cup',
    html: '<ul><li>Chicken Nuggets</li><li>Green Beans</li></ul>'
}
```

### 3.2 Calendar Client Refresh Rates

| Client | Default Refresh | Configurable? | Respects REFRESH-INTERVAL? |
|--------|----------------|---------------|---------------------------|
| Apple Calendar | 1-3 hours | Yes (down to 5 min) | Partially |
| Google Calendar | 8-24 hours | No | No |
| Outlook | 1-3 hours | Partially | Yes (via X-PUBLISHED-TTL) |

### 3.3 Subscription Feed Headers

Include BOTH for max compatibility:
```
REFRESH-INTERVAL;VALUE=DURATION:PT6H
X-PUBLISHED-TTL:PT6H
```

With `ical-generator`: `calendar.ttl(60 * 60 * 6)` generates both.

### 3.4 All-Day Events

- Use `VALUE=DATE` format (YYYYMMDD, no time component)
- `allDay: true` in ical-generator handles this automatically
- DTEND is exclusive (single day April 13 → DTEND April 14)
- Never use UTC midnight (`T000000Z`) for all-day events

### 3.5 VCALENDAR Properties

```
VERSION:2.0
PRODID:-//MealViewer Bridge//mealviewer-bridge 1.0//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:School Lunch Menu
```

---

## 4. Cloudflare Worker Architecture

### 4.1 Recommended Stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Framework | **Hono** | Ultra-fast router, typed bindings, middleware, ~14KB |
| ICS generation | **ical-generator** | Mature, supports plain+HTML descriptions |
| Caching | **CF Cache API** | Free, automatic edge distribution |
| Package manager | **pnpm** | Fast, works well with wrangler |

### 4.2 URL Design

```
/feed/{schoolId}.ics           → ICS calendar subscription feed
/feed/{schoolId}.ics?meal=Breakfast  → Breakfast-specific feed
/api/{schoolId}                → JSON API (cleaned/structured)
/api/{schoolId}.md             → Markdown for AI agents
/api/{schoolId}?format=md      → Alternative markdown access
```

Path-based routing preferred because:
- Cleaner URLs for calendar subscription (paste into calendar app)
- Better CF cache key separation
- CF route patterns can't contain query parameters

### 4.3 Caching Strategy

```typescript
// Cache the transformed ICS/JSON/MD output at the edge
const cache = caches.default;
let response = await cache.match(cacheKey);
if (response) return response;

// Fetch, transform, cache
const data = await fetchMealViewer(schoolId, startDate, endDate);
const output = transform(data, format);
response = new Response(output, { headers });

ctx.waitUntil(cache.put(cacheKey, response.clone()));
return response;
```

**Recommended TTLs:**
- ICS feed: `Cache-Control: public, max-age=3600` (1 hour)
- JSON API: `Cache-Control: public, max-age=1800` (30 min)
- Markdown: `Cache-Control: public, max-age=1800` (30 min)

### 4.4 Free Tier Limits (More Than Enough)

| Resource | Limit | Our Usage |
|----------|-------|-----------|
| Requests | 100,000/day | Minimal (calendar refreshes) |
| CPU time | 10ms/invocation | Sufficient (network wait excluded) |
| Worker size | 3MB compressed | ~100KB with deps |
| KV reads | 100,000/day | Optional |

### 4.5 Hono Setup

```typescript
import { Hono } from 'hono';
import { cache } from 'hono/cache';

const app = new Hono();

app.get('/feed/:schoolId.ics', cache({ cacheName: 'feeds', cacheControl: 'max-age=3600' }), async (c) => {
    const schoolId = c.req.param('schoolId');
    const meal = c.req.query('meal') || 'Lunch';
    // fetch + transform + return ICS
});

app.get('/api/:schoolId', async (c) => {
    // fetch + return clean JSON
});

app.get('/api/:schoolId.md', async (c) => {
    // fetch + return markdown
});

export default app;
```

---

## 5. Markdown Output Design (for AI Agents)

### 5.1 Proposed Format

```markdown
# Emily Dickinson Elementary School — Lunch Menu

## Monday, April 13, 2026

### Daily Feature
- **MOZZARELLA BREAD STICKS** (300 cal, 2 each) — Allergens: milk, wheat
- **MARINARA** (45 cal) — Allergens: soy

### Grab & Go
- **SUB SANDWICH** (281 cal) — Allergens: milk, soy, wheat
- **PB & J SANDWICH** (320 cal) — Allergens: peanut, soy, wheat

### Offered Daily
- Fruit, Vegetables, Milk

---

## Tuesday, April 14, 2026

### Daily Feature
- **SUPER NACHOS** (375 cal) 🌿 Locally Grown — Allergens: milk, corn
- **BLACK BEANS** (110 cal, 1/2 cup)
```

### 5.2 Claude Skill Integration

A future Claude skill could:
```
WebFetch("https://your-worker.workers.dev/api/EmilyDickinsonElementarySchool.md")
```

The markdown format is directly consumable by LLMs without parsing.

---

## 6. Key Design Decisions

### 6.1 Date Range Strategy

- Default: Current week (Monday→Friday) for typical calendar view
- Query param override: `?start=2026-04-13&end=2026-04-17`
- Maximum range: 30 days (API seems to support this)
- Auto-skip weekends (no school meals)

### 6.2 Description Formatting Fix

The mealviewer-to-ICS project's core bug is using HTML in plain-text ICS fields. Fix:

```typescript
// WRONG (current mealviewer-to-ICS)
line += datum.name + "<br/>";

// CORRECT
description: {
    plain: items.map(i => `${i.item_Name} (${calories} cal)`).join('\n'),
    html: `<ul>${items.map(i => `<li><b>${i.item_Name}</b> (${calories} cal)</li>`).join('')}</ul>`
}
```

### 6.3 Multi-Meal Support

Support separate feeds for Breakfast and Lunch:
- `/feed/EmilyDickinsonElementarySchool.ics` → Lunch (default)
- `/feed/EmilyDickinsonElementarySchool.ics?meal=Breakfast` → Breakfast
- `/feed/EmilyDickinsonElementarySchool.ics?meal=all` → Both

---

## 7. Sources

- [MealViewer API Client (BrandCast)](https://github.com/BrandCast-Signage/mealviewer-api-client)
- [MealViewer to ICS (Meandmybadself)](https://github.com/Meandmybadself/mealviewer-to-ICS)
- [MMM-MealViewer (MagicMirror)](https://github.com/KevinGlinski/MMM-MealViewer)
- [ical-generator](https://github.com/sebbo2002/ical-generator)
- [Hono on Cloudflare Workers](https://hono.dev/docs/getting-started/cloudflare-workers)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [RFC 5545 — iCalendar](https://datatracker.ietf.org/doc/html/rfc5545)
- [RFC 7986 — New iCalendar Properties](https://datatracker.ietf.org/doc/html/rfc7986)
- [Home Assistant MealViewer Integration Thread](https://community.home-assistant.io/t/resource-template-url-with-this-week/485452)
- [MagicMirror Forum — MealViewer](https://forum.magicmirror.builders/topic/9812/mmm-mealviewer)
