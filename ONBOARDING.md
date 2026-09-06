# Onboarding: Flood-Risk Route Advisor

This document exists so a new person (or future-you) can read one file and understand what this project is, why every major decision was made the way it was, how the system actually works end to end, what's been built, what's tested, and what's still open. It's written as a narrative of the actual working session, not a spec — the "why" is kept in, not just the "what," because that's what makes the decisions make sense later.

No code is included here on purpose. This is the reasoning and the shape of the system, not the implementation. File paths are mentioned so you know where to look, but read the actual files for code.

## What this project is

A Next.js app (repo name: `flood`) built around Google Maps, that is evolving into a flood-risk / safer-route advisor for the Kota, Rajasthan area (centered near Rajasthan Technical University). The end goal: a user can click a road or area on the map, or pick two points to travel between, and the app tells them how much rain is expected there, how risky that means the road is (low/medium/high), and — for a route — which of the available paths between two points is safest to take.

Nothing here does anything illegal or sensitive; it's a practical, everyday mapping + weather tool.

## How the project started, and how it grew

The very first question asked was simple: if you integrate Google Maps into an app, can you detect which road or area a user clicked, and get its coordinates? The answer is yes — Google Maps fires a click event carrying latitude/longitude, and from there you can reverse-geocode that point to get the nearest road/address name. That became the first working feature: click the map, see the lat/lng and the road/area name.

The next question was whether a clicked road can be visually highlighted (e.g. drawn in red). The honest answer: Google Maps doesn't hand you "the whole road" as a ready-made shape from just a clicked point — you'd need your own road geometry data (or Google's Roads API, which only snaps short segments) to draw a full road highlight. Highlighting a broader *area* is much easier (draw your own polygon, check if a click falls inside it). Since the project didn't have its own road/area geometry data, highlighting was explicitly dropped from scope — the working point-click demo shows information about the clicked point, not a colored overlay.

From there, the conversation shifted to a bigger idea: what if clicking a road told you not just its name, but how much rain is expected there, and whether that means the road is likely to flood or become impassable? And what if, given two points to travel between, the app could recommend the safer of the available routes? That reframing is what turned this from a "click a map" demo into the flood-risk route advisor described in this document.

To answer "what data can weather APIs actually give us," OpenWeatherMap's One Call API 3.0 was researched directly from OpenWeather's own documentation. It turned out to offer: current weather plus short-term forecasts (minute-by-minute for an hour, hourly for two days, daily for a week), government weather alerts, a "weather for any timestamp" historical/near-future lookup, a daily-aggregated summary endpoint, an AI-generated human-readable weather overview for today/tomorrow, and even a conversational "AI Weather Assistant." Pricing-wise, this API sits in its own subscription called "One Call by Call," separate from OpenWeather's tiered plans, and gives 1,000 free calls per day before charging a small per-call fee.

Critically, none of this data includes anything about "flood risk" or "road safety" directly — that logic had to be designed from scratch, using rainfall as the input signal and a set of hand-picked thresholds as the output rule. This is one of the most important things to understand about the whole system: the "risk" the app shows is not something any API provides — it's a formula this project defines and owns.

## The constraint that shaped the entire architecture

Partway through, it became clear the two APIs in play have wildly different budgets: **the OpenWeather quota is tight (1,000 calls/day)**, while **the Google Maps quota is generous**. This asymmetry became the single biggest driver of every architectural decision that followed. The guiding principle adopted was: push as much of the work as possible onto Google Maps (cheap), and minimize OpenWeather usage to something fixed and predictable, independent of how many people use the app.

## The core architectural idea: decouple weather fetching from user requests

Instead of calling OpenWeather every time a user clicks a point or asks for a route — which would scale with traffic and be impossible to budget for — the system precomputes rainfall on a fixed grid, on a fixed schedule, completely independent of how many users are active at any moment. User-facing requests only ever read from this precomputed cache; they never trigger a live OpenWeather call. This is the crux of the whole design, and it's what makes a 1,000-call-per-day quota workable for what could otherwise be unbounded traffic.

Concretely: the Kota area (roughly a 15km-by-15km box centered on RTU Kota) is divided into a grid of cells. A background job runs on a fixed timer, and for each cell it makes exactly one OpenWeather call to get that cell's current rainfall, then stores the result (rainfall amount, and a computed risk level) in a simple in-memory cache keyed by cell. When a user clicks a point, or the app needs rainfall along a route, it just looks up which cell that point falls into and reads the cached value — no network call to OpenWeather happens at request time at all.

This means total OpenWeather usage per day is a fixed, known-in-advance number: the number of grid cells times how many times per day the background job runs. That number is sized to comfortably fit inside the 1,000/day quota, with room to spare.

## How the numbers were actually sized

With the confirmed 1,000-calls-per-day quota, the grid was sized to a 5-kilometer cell size, giving about 9 cells to cover the ~15km-by-15km area of interest, refreshed every 15 minutes (this roughly matches how often OpenWeather's own underlying model updates anyway, so refreshing faster than that wouldn't gain anything). That works out to about 864 calls per day for the rainfall job alone.

Later, a second background job was added for OpenWeather's AI-generated "weather overview" summary (a human-readable paragraph, not a number) — since a descriptive summary doesn't need to be refreshed every 15 minutes the way a rainfall number does, it runs on its own, much slower schedule (every 3 hours), adding roughly 72 more calls per day. Combined, the two jobs use about 936 calls per day, leaving a buffer of roughly 64 calls per day — enough headroom for the background job to retry failures, or for the occasional manual cache-refresh trigger used during development, without ever bumping into the quota.

Everything about these numbers — cell size, how often rainfall refreshes, how often the AI overview refreshes, and the quota itself — lives in one small, dedicated configuration file, read from environment variables rather than hardcoded. This was a deliberate choice: the moment the OpenWeather quota is increased in the future, improving accuracy is meant to be a two-or-three-number change in that one file (smaller cells, and/or faster refresh intervals) — nothing else in the system needs to be touched or redesigned, because every other piece of the pipeline only ever asks "what's the rainfall for this cell," with no awareness of how big the cell is or how often it gets refreshed.

## How risk is actually calculated

This is the heart of the "logic" the user asked to have explained plainly.

For any single point, risk starts from a rainfall number (millimeters per hour, from OpenWeather). Three tiers were defined by hand as a starting point: under 10mm/hour is "Low" risk, between 10 and 30mm/hour is "Medium," and above 30mm/hour is "High." These exact numbers are a placeholder judgment call, not something calibrated against real flooding history for these specific roads — the project deliberately excluded historical-rainfall calibration for now (the user asked to leave that out), so these thresholds are meant to be revisited later once there's a reason to trust a different cutoff.

For a route between two points, the app doesn't just look at one point — it asks Google's Directions API for two or three alternative routes, decodes the path each route follows (this decoding happens locally, on the server, using no external API call at all), and then samples points at a fixed distance along that path (roughly every 300 meters, though because this sampling is free once you already have the cached grid data, the density could be made much finer without costing anything extra). Every sampled point along a route gets its own risk level looked up from whichever grid cell it falls into. The whole route's risk is then taken to be the *worst* risk level found among all its sampled points, not an average — the reasoning being that it's safer for a flood-risk tool to over-warn than under-warn; a single bad stretch of a route is enough to call the whole route risky, because the goal is to avoid a traveler getting stuck, not to optimize for the "average" conditions along the way.

Once every candidate route has a risk level, the routes are ranked from lowest to highest risk, and the lowest-risk one is presented as the recommended choice.

There is a second, optional layer meant to sharpen this rainfall-only picture: elevation. The idea is that a low-lying stretch of road floods worse than a hilltop stretch under the same rainfall, so a point sitting well below the route's median elevation has its risk bumped up one level, and a point well above the median has its risk dampened down one level. This logic exists in the code and is fully written, but it is **currently switched off** by a feature flag, because the Google Maps API key in use isn't yet authorized to call Google's Elevation API (Google's cloud console rejected it with an authorization error). Rather than rip the feature out, it was deliberately gated behind a simple on/off switch so that once the Elevation API is enabled for that key in Google Cloud Console, turning the feature back on is a one-line configuration change, not a rewrite. Until then, route risk is based purely on rainfall.

## The two main user-facing flows

**Clicking a single point on the map:** the click is reverse-geocoded (via Google) to get a human-readable road/area name, and separately, the same lat/lng is mapped to its grid cell and the cached rainfall, risk level, and (if available) the AI-generated weather overview sentence for that cell are displayed. None of this triggers a live weather API call — it's all reading from whatever the background job most recently cached.

**Comparing routes between two points:** the user can either click two points directly on the map, or type addresses into two labeled input fields (labeled Point A and Point B) that use Google's Places Autocomplete to suggest matching addresses as they type, biased toward the Kota area. Once both points are set, the app asks Google Directions for alternative routes, works out a risk level for each as described above, draws each route on the map as a colored line (green for low risk, yellow for medium, red for high), and shows a ranked list with the safest route marked as recommended.

## Why Google Maps usage was designed to be "generous" while OpenWeather usage was designed to be "frugal"

Because the sampling of points along a route reads from the pre-cached rainfall grid rather than calling OpenWeather live, the density of that sampling — and therefore the precision of the route-risk picture — is now bounded only by how many Google Maps calls it takes (Directions, and optionally Elevation), which is the budget that isn't under pressure. This is why, for example, sampling a route every 100 meters instead of every 500 meters costs nothing extra in OpenWeather terms — it only means slightly more local computation and, if elevation is turned on, a modestly larger single batched Elevation API call.

Google's Roads API (which can snap a point to the exact nearest road geometry) was considered for extra precision but deliberately not built — the Directions API's own route path is already precise enough for what this project needs, and adding an unused module would have been scope creep without a concrete use for it yet.

## What has actually been built so far

- The original point-click demo: click the map, see latitude/longitude, the reverse-geocoded road/area name, the cached rainfall figure, the computed risk level, and (when available) OpenWeather's AI-written weather overview sentence for that spot.
- The grid system: the math that defines the Kota bounding box, divides it into cells of a configurable size, and converts between a latitude/longitude and the grid cell it falls into.
- The in-memory weather cache: a simple store keyed by grid cell, holding the latest rainfall figure, risk level, and AI overview text, along with when each was last updated. It's built to survive the development server's automatic hot-reloading, so it doesn't get wiped out every time a file is edited during development.
- Two background jobs: one refreshing rainfall for every grid cell on the fast (15-minute) schedule, and one refreshing the AI overview text on the slower (3-hour) schedule. Both are kicked off automatically whenever the server starts, using Next.js's built-in "instrumentation" startup hook, and both guard themselves against a projected-usage warning if the configured settings would exceed the daily quota.
- The risk-scoring logic: the rainfall-to-risk-level thresholds, the elevation-adjustment logic (currently disabled, as explained above), and the "worst point wins" rule for combining many points into one route-level risk.
- The route-comparison pipeline: requesting alternative routes from Google, decoding and resampling their paths locally, looking up cached risk for every sampled point, aggregating and ranking the routes, and returning the ranked list with a recommendation.
- The route-comparison UI: a page with two labeled address input fields with autocomplete suggestions, click-to-set-point support directly on the map as an alternative to typing, colored route lines drawn on the map, and a card-based ranked list of the candidate routes with their distance, travel time, and risk level.
- A manual "warm the cache now" trigger, used during development so the cache can be refreshed on demand without needing to restart the whole server (since the two background jobs otherwise only kick off automatically when the server boots).
- A `docs/` folder capturing the architecture and every accuracy-versus-cost trade-off in more technical detail than this document — see `docs/architecture.md` and `docs/tradeoffs.md` if you want the fuller technical picture, including the exact formulas used to size the grid.

## What's been verified versus what's still open

Type-checking and linting pass cleanly across everything that's been built. The route-comparison pipeline has been exercised directly (not just read over) and confirmed to return real Google-sourced route names, distances, and durations, with sensible fallback risk values while the weather cache is empty. The point-click endpoint has likewise been confirmed to respond correctly and gracefully when no cached weather exists yet for a given spot, rather than erroring.

What's still unverified or blocked:

- **Real rainfall data is not flowing yet.** The OpenWeather account's API key is valid, but One Call API 3.0 specifically requires subscribing to a separate "One Call by Call" plan beyond just having an account and a key — this was confirmed directly from OpenWeather's own error response, not guessed. Until that subscription is active (OpenWeather says activation can take a couple of hours after subscribing), the background rainfall and overview jobs will keep failing with an authorization error, and every risk calculation will keep defaulting to "Low" because there's no real rainfall number to work from.
- **Elevation-based risk refinement is implemented but switched off**, pending the Elevation API being enabled for the Google Maps key in Google Cloud Console (it's currently rejected with an authorization error there too).
- **The server-side Google Maps key currently reuses the same key used in the browser.** If that key turns out to be restricted to browser use only (an "HTTP referrer" restriction), the server-side Directions and Elevation calls will fail, and either that restriction will need relaxing or a second, separate key will be needed for server-side calls.
- **A full visual, in-browser check of the map UI and the new address-autocomplete inputs was in progress** (using a headless browser test harness set up specifically for this, since the environment's preferred tool for it wasn't available) at the point this document was written, to confirm everything actually renders and behaves correctly for a real user, not just that the underlying API endpoints respond correctly.

## Notable incidents and decisions worth knowing about

Early on, right after an environment file was created with a placeholder API key, the file was found to have changed on disk to contain what looked like a shell command instead of a real key — this was flagged directly as suspicious before proceeding any further, rather than assumed to be harmless, since it resembled an attempt to get an unrelated command executed. It turned out to be resolved by the time work continued (the real key was supplied afterward), but the instinct to stop and flag it rather than quietly overwrite or ignore it is worth preserving as a working pattern for this project.

A subtle bug was caught during testing where the grid math produced one extra row and column of cells (12 instead of the intended 9) purely because of floating-point rounding error compounding through a chain of unit conversions before a rounding-up step — it was caught by actually restarting the server and reading the real numbers in the logs, not by inspection, and fixed by subtracting a tiny buffer before rounding up.

## Secrets and configuration this project depends on

A Google Maps API key is needed for the browser-side map, geocoding, autocomplete, and (separately, server-side) for Directions and Elevation calls. An OpenWeatherMap API key is needed for the background rainfall and overview jobs, and that account additionally needs the "One Call by Call" subscription specifically activated, not just a generic account. A handful of small tunable numbers (grid cell size, how often rainfall refreshes, how often the AI overview refreshes, the daily quota figure itself, and whether elevation-based refinement is turned on) are also configured via environment variables rather than hardcoded, specifically so they can be adjusted without changing code later.

## Where to look for more detail

For the more technical, engineering-facing version of the architecture and every trade-off made (with the exact math behind the grid sizing), see `docs/architecture.md` and `docs/tradeoffs.md` in this repository. This document is meant to be the plain-language, full-context version of the same story — if something here seems to disagree with those files, treat those files as the more precise and up-to-date technical source, and this document as the narrative explanation of how it got that way.
