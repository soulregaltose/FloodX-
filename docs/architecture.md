# Architecture: Flood-Risk Route Advisor

## Goal

Given a road/area (click on map) or a route (origin → destination), tell the user:
1. How much rainfall is expected there.
2. A risk level (Low / Medium / High) — proxy for "how likely this road floods/gets blocked."
3. For a route: which of the candidate paths is safest, and why.

Budget constraint driving this design: **OpenWeather calls are expensive/limited, Google Maps calls are cheap/plentiful.** So the design pushes as much work as possible onto Google Maps APIs and minimizes real-time OpenWeather calls to near-zero per user request.

## Core idea: decouple weather fetching from user requests

Instead of calling OpenWeather every time a user clicks a point or requests a route (which scales with traffic and is unpredictable), we **precompute rainfall on a fixed grid, on a fixed schedule**, independent of how many users are active. User requests only ever read from this cache — they never trigger a live OpenWeather call.

```
                 ┌─────────────────────────────┐
  every 15 min   │  Background job (cron)      │
  ─────────────► │  1 OpenWeather call per     │──► rainfall cache (grid cell → risk)
                  │  grid cell covering Kota    │
                  └─────────────────────────────┘
                              ▲
                              │ read-only, no API call
                              │
  ┌───────────────────────────────────────────────────┐
  │  User request (click point / plan route)           │
  │  - Google Directions API → route polyline(s)        │
  │  - Google Elevation API → elevation per sample point │
  │  - Lookup rainfall cache by grid cell (no API call) │
  │  - Combine rainfall + elevation → risk score         │
  └───────────────────────────────────────────────────┘
```

This bounds total OpenWeather usage to `(number of grid cells) × (refreshes per day)`, completely independent of traffic — the key lever for staying within a tight quota. See [`tradeoffs.md`](./tradeoffs.md) for what this costs us in accuracy/freshness.

## Components

| Module | Responsibility | API budget used |
|---|---|---|
| `lib/weather/config.ts` | The tunable dials (cell size, refresh intervals, quota) — nothing else reads env vars directly | none |
| `lib/weather/grid.ts` | Defines the grid over the area of interest (Kota bounding box), cell size, cell-id ↔ lat/lng math | none |
| `lib/weather/refresh-job.ts` | Two scheduled jobs: `runRefreshJob` (rain, every 15 min) and `runOverviewRefreshJob` (AI summary, every 180 min), both one call per grid cell, writing to cache | OpenWeather (bounded, scheduled) |
| `lib/weather/cache.ts` | Read/write store for `{cellId → {rainMm, risk, updatedAt, overview?, overviewUpdatedAt?}}` | none |
| `lib/maps/polyline.ts` | Decodes Directions API polylines, resamples them at a fixed distance interval | none (local computation) |
| `lib/maps/directions.ts` | Calls Directions API (`alternatives=true`) | Google (Directions) |
| `lib/maps/elevation.ts` | Batch Elevation API call for sample points along a route — **implemented, currently disabled via `ELEVATION_ENABLED=false`** (see below) | Google (Elevation) |
| `lib/risk/scoring.ts` | Pure functions: `scoreRainfall(rainMm)`, `adjustForElevation(risk, elevation, medianElevation)` | none |
| `lib/risk/route-aggregate.ts` | Combine per-point risk into a route-level score (worst-point wins), rank routes | none |
| `app/api/point-risk/route.ts` | Reads cached rainfall/risk/overview for a lat/lng (no live call) | none |
| `app/api/route-risk/route.ts` | Route Handler tying the above together for route mode | Google (Directions, Elevation if enabled) |
| `app/api/weather-refresh/route.ts` | Manual trigger to warm the cache during development, without restarting the server | OpenWeather (on-demand) |
| `instrumentation.ts` | Starts both background refresh loops once per server instance | — |
| `components/RouteMap.tsx` | Renders candidate routes, colored by risk; click-to-set origin/destination | — |
| `components/Map.tsx` | Point-click demo: road/area name, rainfall, risk, AI overview | — |

## Data flow

### A. Background refresh (runs independent of users)

1. Define bounding box around Kota (or wherever the app is scoped to).
2. Divide it into grid cells (default: ~2km × 2km — tunable, see tradeoffs).
3. Every refresh cycle (default: 15 min — OpenWeather itself only updates every 10 min, so polling faster buys nothing):
   - One OpenWeather One Call request per cell center.
   - Extract rain volume (`rain.1h` / hourly forecast) and compute risk via `lib/risk/scoring.ts`.
   - Write `{cellId: {rainMm, risk, updatedAt}}` to cache.
4. Total OpenWeather calls/day = `cells × (24×60/15)`. This number is fixed and known in advance — size the grid to fit the quota, not the other way around.
5. A second, much slower job (`runOverviewRefreshJob`, default every 180 min) fetches OpenWeather's AI-generated `weather_overview` per cell from the `/onecall/overview` endpoint and merges it into the same cache entry. It runs far less often than the rain job because the human-readable summary doesn't need 15-minute freshness — see the budget math below.

### B. Point click (user clicks a road/area)

1. Google Geocoder: lat/lng → road/area name (already built).
2. Map lat/lng → grid cell id.
3. Read rainfall/risk/AI overview from cache (no live API call).
4. Optionally: Google Elevation API for that exact point to refine risk (cheap, always fresh, no quota concern — currently disabled, see below).
5. Display: road name, rainfall, risk badge, and OpenWeather's AI weather-overview summary for that cell.

### C. Route mode (origin → destination)

1. Google Directions API, `alternatives=true` → 2–3 candidate routes with encoded polylines.
2. Decode each polyline locally (no API call) → sample points every ~300–500m.
3. Map each sample point → grid cell → cached rainfall/risk (no live API call, however many points you sample — sampling density is now free).
4. Google Elevation API: one batched call per route (all sample points in one request) to adjust risk for low-lying stretches.
5. `lib/risk/route-aggregate.ts`: route risk = worst-case (max) risk among its points, adjusted by elevation.
6. Return ranked routes; recommend the lowest-risk one.
7. Render via `DirectionsRenderer` or manual `Polyline`s, colored green/yellow/red.

Because rainfall lookups are cache reads, you can now sample routes as densely as you want (every 100m instead of 500m) at **zero extra OpenWeather cost** — density is bounded only by Google Maps usage, which is the budget you have room in.

## Risk scoring (starting point, tune later)

Base rule from rainfall:

| Rainfall (mm/hr) | Base risk |
|---|---|
| < 10 | Low |
| 10–30 | Medium |
| > 30 | High |

Elevation adjustment (since Google Elevation is cheap, use it to sharpen the rainfall-only signal):
- Below area's median elevation → bump risk one level up (e.g. Medium → High).
- Above median elevation → risk stays as-is, or is dampened one level down at the boundary rainfall values.

> **Status: implemented but disabled by default.** The Maps key currently isn't authorized for the Elevation API (`REQUEST_DENIED` from Google), so `ELEVATION_ENABLED` defaults to `false` in `.env.local`. While off, `app/api/route-risk/route.ts` skips the elevation lookup entirely and route risk falls back to rainfall-only scoring — the code in `lib/maps/elevation.ts` and `adjustForElevation` is untouched and ready to go. To turn it on: enable "Elevation API" for the Maps key's project in Google Cloud Console, then set `ELEVATION_ENABLED=true`.

Route-level: `risk(route) = max(risk(point) for point in sampled points)`.

## Grid sizing — the main lever for OpenWeather cost control

Cell size trades accuracy for call volume:

| Cell size | Cells to cover a ~15km × 15km city | Calls/day @ 15-min refresh |
|---|---|---|
| 1 km | ~225 | ~21,600 |
| 2 km | ~56 | ~5,400 |
| 3 km | ~25 | ~2,400 |
| 5 km | ~9 | ~864 |

Pick the cell size and refresh interval to fit under your actual daily quota with margin — see [`tradeoffs.md`](./tradeoffs.md) for the reasoning on why coarser grid + fresher elevation/routing data is an acceptable trade here.

## Configuration — sizing the grid to your quota, and scaling later

Cell size and refresh interval are **not hardcoded** — they're the two dials that control OpenWeather usage, so they live in one config module read from env vars:

```
lib/weather/config.ts
  WEATHER_GRID_CELL_KM               (default: 5)
  WEATHER_REFRESH_MINUTES            (default: 15)
  WEATHER_OVERVIEW_REFRESH_MINUTES   (default: 180)
  OPENWEATHER_DAILY_QUOTA            (default: 1000)
```

With your current quota (**1000 calls/day**), solving the formula from [`tradeoffs.md`](./tradeoffs.md) for the ~15km × 15km Kota bounding box gives these defaults:

- **Cell size: 5 km** → ~9 cells covering the area
- **Rain refresh: every 15 min** → 9 × (1440/15) = **864 calls/day**
- **AI overview refresh: every 180 min** (it's a human-readable summary, not a number — doesn't need 15-min freshness) → 9 × (1440/180) = **72 calls/day**
- **Total: 936 calls/day, ~64/day buffer** — covers the background job retrying a failed cell, plus the occasional manual point-check you mentioned you'll still do during development.

`refresh-job.ts` calls a small guard, `estimateDailyCalls(cellKm, refreshMin, bboxAreaKm2)`, before starting, and logs a warning (not a hard stop) if the configured values would exceed `OPENWEATHER_DAILY_QUOTA`. That's the entire mechanism for "improving accuracy later":

**When your OpenWeather quota goes up, improving accuracy is a two-number change — nothing else in the pipeline moves:**

| You increase quota to... | Change | Effect |
|---|---|---|
| 2,000/day | `WEATHER_GRID_CELL_KM=3` (same 15 min interval → ~2,400/day, still tune down interval slightly, e.g. 20 min → ~1,800/day) | Finer grid, same freshness |
| 5,000+/day | `WEATHER_REFRESH_MINUTES=10` (matches OpenWeather's own update cadence) at 3km cells | Near-real-time freshness at finer resolution |
| Effectively unlimited | Drop the grid-cache approach entirely, call OpenWeather per request | Full per-point accuracy (not needed at current scale) |

Nothing in `cache.ts`, `scoring.ts`, `route-aggregate.ts`, or any of the Google Maps modules needs to change — they only ever read "rainfall for this cell," regardless of how fine the grid is or how often it refreshes. That's the point of isolating the config: better quota later = smaller numbers in one file, not a redesign.

## Folder structure (planned additions)

```
lib/
  weather/
    grid.ts
    cache.ts
    refresh-job.ts
  maps/
    directions.ts
    elevation.ts
    roads.ts
    geocode.ts        (exists, currently inline in components/Map.tsx — extract)
  risk/
    scoring.ts
    route-aggregate.ts
app/
  api/
    route-risk/
      route.ts
  components/
    RouteMap.tsx
    RiskPanel.tsx
docs/
  README.md
  architecture.md
  tradeoffs.md
```

## Open decisions

1. ~~Grid cell size + refresh interval~~ — resolved: 5km / 15min defaults for the 1000/day quota (see Configuration section above).
2. **Cache storage** — in-memory (simplest, resets on server restart, fine for a single-instance dev/demo) vs. a small persistent store (survives restarts, needed if this goes to production with multiple instances).
3. **Bounding box** — confirm the exact area to cover (just Kota city, or a wider region?) since this directly sets the cell count and cost.
