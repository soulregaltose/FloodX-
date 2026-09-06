# Trade-offs: Accuracy vs. OpenWeather API Cost

Constraint driving every decision here: **OpenWeather quota is tight, Google Maps quota is not.** Every trade below sacrifices some weather accuracy/freshness to cut OpenWeather calls — and where possible, we claw accuracy back using Google Maps APIs instead, since that budget is spare.

| # | Trade-off | What we gain (cost) | What we lose (accuracy) | Why acceptable | Clawed back via Google Maps? |
|---|---|---|---|---|---|
| 1 | **Precomputed grid cache instead of per-request calls** | OpenWeather usage becomes fixed and predictable (`cells × refreshes/day`) instead of scaling with traffic | Rainfall value for a point is the value at its cell's center, not that exact coordinate | Rainfall doesn't meaningfully vary over a 1–5km radius on the timescale we care about (flood warnings, not precision agriculture) | Elevation API (per-point, cheap) sharpens the risk locally even though rainfall itself is cell-level |
| 2 | **Grid cell size (default 2km, tunable up to 5km if quota is tighter)** | Fewer cells = fewer calls per refresh cycle | Coarser resolution — a 5km cell can't distinguish two roads 3km apart that behave differently | Bigger cells first; only shrink if the quota has headroom. Start conservative, tighten later once real usage is measured | Use Google Elevation + Roads API to add sub-cell differentiation (two roads in the same cell can still get different *elevation-adjusted* risk) |
| 3 | **Refresh interval (15 min, not real-time)** | Fixed calls/day regardless of how often users check | Data can be up to 15 min stale | OpenWeather's own model only updates every ~10 min — polling faster than that buys nothing anyway, so this loses ~5 min of "theoretical" freshness for a large cut in calls | — |
| 4 | **Sampling density along a route is now "free"** | N/A (this is a win, not a loss) | None | Because rainfall is a cache read, sampling every 100m instead of 500m costs zero extra OpenWeather calls — the earlier plan's density limit only existed *because* we assumed live calls per point | Directions API polyline decoding is local (no extra Google cost either) |
| 5 | **Route risk = worst-point (max), not average** | Simpler, and doesn't require more granular data to compute | Slightly pessimistic — one bad cell can flag an otherwise-fine route as "High" | Safer to over-warn than under-warn for a flood-risk tool; the point is to avoid getting stuck, not to optimize for average conditions | — |
| 6 | **No historical rainfall calibration (explicitly excluded per your request)** | Zero extra OpenWeather calls for historical lookups | Risk thresholds (10mm/30mm) are static guesses, not calibrated to what actually floods each road | Acceptable starting point; thresholds are isolated in one function (`lib/risk/scoring.ts`) so they're cheap to revisit later without touching the rest of the pipeline | — |
| 7 | **Bounding box scoped to one city (Kota), not statewide/national** | Keeps the grid small regardless of cell size | Doesn't generalize automatically if you expand coverage later | Matches current scope (RTU Kota area); expanding later just means resizing the grid, not redesigning anything | — |
| 8 | **AI weather-overview summary refreshed every 180 min, not every 15 min like rainfall** | Adds only ~72 calls/day instead of another ~864/day if it rode the same cadence as rain | The descriptive summary shown to users can be up to 3 hours stale | It's a human-readable narrative ("overcast, light rain expected...") — that framing doesn't meaningfully change minute to minute the way an mm/hr number does | — |
| 9 | **Elevation adjustment implemented but disabled by default (`ELEVATION_ENABLED=false`)** | Zero Google Elevation calls until explicitly turned on | Route risk currently falls back to rainfall-only scoring — no low-lying-road sharpening | The Maps key isn't yet authorized for the Elevation API (`REQUEST_DENIED`); rather than block the rest of the pipeline, we gated it behind a flag so it's a one-line config change once the API is enabled, not a rewrite | N/A — this trade is about Google Maps setup, not OpenWeather cost |

## The one formula that matters

```
OpenWeather calls/day = (bounding box area / cell area) × (24×60 / refresh interval in minutes)
```

**Solved for your quota (1,000 calls/day, ~15km × 15km Kota bounding box):**

- Cell size: **5 km** → ~9 cells
- Rain refresh: **15 min** → 9 × (1440/15) = **864 calls/day**
- AI overview refresh (`weather_overview` from `/onecall/overview`): **180 min** → 9 × (1440/180) = **72 calls/day** — refreshed far less often since it's a descriptive summary, not a number that changes minute to minute
- **Total: 936 calls/day, ~64/day buffer** — covers job retries and the occasional manual point-check during development (you noted you won't be testing heavily, so this is a comfortable margin, not a tight squeeze)

This is trade-off #8 in the table above, in the same spirit as #3: the overview doesn't need the same freshness as rainfall, so it gets its own (much slower) refresh cadence instead of riding on the 15-minute rain job and doubling the call count.

These numbers (`WEATHER_GRID_CELL_KM`, `WEATHER_REFRESH_MINUTES`, `WEATHER_OVERVIEW_REFRESH_MINUTES`) live in `lib/weather/config.ts`, read from env vars — nothing else in the pipeline reads the quota directly. That's deliberate: **raising the OpenWeather quota later is a config change, not a redesign.** Every downstream module (`cache.ts`, `scoring.ts`, `route-aggregate.ts`, all the Google Maps modules) only ever asks "what's the rainfall/overview for this cell?" — it has no idea how big the cell is or how often it refreshes. So:

| New quota | New config | What improves |
|---|---|---|
| 1,000/day (current) | `cell=5km`, `interval=15min` | Baseline — city-level resolution, refreshed every 15 min |
| 2,000/day | `cell=3km`, `interval=15–20min` | ~2.8× finer grid, same freshness |
| 5,000/day | `cell=3km`, `interval=10min` | Finer grid *and* refresh matches OpenWeather's own model update cadence — effectively as fresh as the data source allows |
| No practical limit | Skip the grid cache, call OpenWeather live per request | Full per-point, per-request accuracy — only worth it once quota stops being the constraint |

No code outside `lib/weather/config.ts` needs to change to move between these — the grid math, cache shape, and risk scoring are all written in terms of "a cell," not "a 5km cell."

## What we deliberately did NOT trade away

- **Route quality** — Directions API is called live, per request, with `alternatives=true`, at full accuracy. No caching/staleness here since Google Maps isn't the constrained resource.
- **Elevation accuracy** — designed to be called live, per sample point (batched into one request per route), since it's cheap and doesn't expire like weather does. Currently gated off by `ELEVATION_ENABLED=false` pending the Elevation API being enabled on the Maps key's project (trade-off #9) — not a cost trade, a setup blocker.
- **Road/geocoding accuracy** — Geocoding and Roads API stay live and per-request, same reasoning.
