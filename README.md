# Locale — UK Area & School Intelligence (MVP)

Enter a UK postcode → get a map-first dashboard of the **schools, crime, and property prices**
around it, in ~one request, from free/open data. No login.

> Working name "Locale" is a placeholder — rename freely.

This is the first vertical slice of the larger brief (a Locrating-style area/school platform).
It deliberately nails the success condition first: _a parent enters a postcode and within
seconds sees schools within 1 mile, crime relative to a national benchmark, and the local
property price picture._

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

No API keys required. Try a postcode like `SW11 6QT`, `M20 2RN`, `BS6 7XL`, or `LS6 3HN`.

## What's live (all real data, no fabrication)

| Layer            | Source                                   | Notes |
|------------------|------------------------------------------|-------|
| Postcode → point | postcodes.io                             | + IMD deprivation decile, district, constituency |
| Schools          | OpenStreetMap via Overpass               | live locations within 1 mile, any UK postcode |
| Crime            | police.uk street-level crime             | ~1-mile radius, latest month, vs geographic average |
| Property prices  | HM Land Registry Price Paid (linked data)| recorded sales for the exact postcode |

### Ofsted ratings

School **locations** are live. School **ratings** load from the official DfE/Ofsted dataset via
an ETL — they are never guessed:

```bash
npm run etl:schools   # builds src/data/ofsted-by-urn.json (joined by URN)
```

Until that runs, ratings show as "not loaded". See [`scripts/etl/README.md`](scripts/etl/README.md).
(The gov.uk GIAS download was returning 5xx at build time — the script supports a manual CSV path.)

## Honesty by design

- Every panel names its data source.
- The 1-mile ring is a **distance guide, not a catchment boundary** (catchment is phase 2).
- Crime "× average" is a **geographic** benchmark, flagged as approximate.
- Failed/partial upstream responses are surfaced (not hidden) and never cached.

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Leaflet (OpenStreetMap/CARTO tiles) ·
optional Upstash Redis caching. See [`DOCUMENTATION.md`](DOCUMENTATION.md) for architecture,
the full feature roadmap from the brief, and design decisions (incl. Leaflet-vs-Mapbox).
