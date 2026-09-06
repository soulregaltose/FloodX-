# Flood Route Advisor — Docs

This folder documents the plan for the flood-risk / safer-route feature we're building on top of:
- **Google Maps** (Maps JS, Geocoding, Directions, Elevation, Roads) — budget is generous, use freely.
- **OpenWeatherMap One Call API 3.0** — budget is tight, minimize calls aggressively.

## Contents

- [`architecture.md`](./architecture.md) — the system design: data flow, components, caching strategy, API usage.
- [`tradeoffs.md`](./tradeoffs.md) — every place we sacrifice accuracy/freshness to cut OpenWeather API usage, and why it's an acceptable trade.

## Status

Planning stage — Google Maps click → lat/lng → road/area name is already built (`components/Map.tsx`). Everything in `architecture.md` beyond that is planned, not yet implemented.
