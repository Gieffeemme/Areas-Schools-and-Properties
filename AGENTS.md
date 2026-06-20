# area-intel — UK Area & School Intelligence (MVP)

A map-first dashboard: enter a UK postcode, get schools nearby, crime, and property
prices — all from free/open data, no login.

## Heads-up: non-standard Next.js
This uses **Next 16**. APIs and conventions can differ from older Next you may know.
When in doubt, read `node_modules/next/dist/docs/` and mirror the patterns already in
`src/` rather than assuming defaults from memory.

## Data sources (all live, no API key required)
- **postcodes.io** — postcode → lat/lng (+ IMD deprivation rank, LSOA, district, constituency).
- **Overpass (OpenStreetMap)** — school locations within the search radius (live).
- **police.uk** — street-level crime within ~1 mile of a point (latest available month).
- **HM Land Registry Price Paid** (linked-data REST) — sold prices by postcode.

## Ofsted ratings (enrichment)
School *locations* are live from OSM. School *ratings* come from the official DfE GIAS +
Ofsted datasets and are loaded via an ETL, not guessed:

    npm run etl:schools     # builds src/data/ofsted-by-urn.json

Until that file is populated, the UI shows ratings as "not loaded" instead of inventing
them. The join key is the URN (OSM tag `ref:edubase`).

## Caching
Optional Upstash Redis (`KV_REST_API_URL` / `KV_REST_API_TOKEN`). The app runs fully
without it. **Never cache failed or partial upstream responses.**

## Honesty principles (carried into the UI)
- Show data provenance on every panel.
- The 1-mile ring is a distance guide, **not** a catchment boundary (catchment is phase 2).
- Crime "vs national average" is a geographic benchmark — flagged as approximate.
