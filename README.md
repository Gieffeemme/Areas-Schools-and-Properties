# Locale — UK Area & School Intelligence

Enter a UK **postcode** (or a **school name**) → a map-first dashboard of the **schools, crime,
property prices and deprivation** around it, plus a deep per-school detail view. Free/open data,
no login. A Locrating-style area & school platform.

> Working name "Locale" is a placeholder — rename freely.

**Live:** https://areas-schools-and-properties.vercel.app · push to `main` → Vercel auto-deploys.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

No API keys required for the dashboard (the `/map` explorer page needs `NEXT_PUBLIC_MAPBOX_TOKEN`).
Try a postcode like `SW11 6QT`, `M20 2RN`, `LS6 3HN`, `CF10 1EP` (Wales), or a school name.

## What's live (all real data, no fabrication)

| Layer | Source | Notes |
|-------|--------|-------|
| Postcode → point | postcodes.io | + IMD overall decile **and 7-domain breakdown**, district, region |
| **Schools** | **GIAS** (Eng) + **Welsh Gov** (Wal) + **SG** (Scot) + **DE NI** (NI) registers — all four nations | ~24.9k Eng + ~1.5k Wal + ~2.5k Scot + ~1.1k NI open schools, pins + pupils/type/phase; Welsh-/Irish-medium tagged; NI grammars flagged |
| **Nurseries** | **Ofsted Early Years register** | ~23k, postcode-geocoded, each Ofsted-rated |
| **Per-school depth** | DfE + Ofsted, joined by **URN** | Ofsted + sub-grades, KS2/GCSE/A-level, destinations, pupil census, **workforce**, **finances**, full Parent View (England); Wales links to My Local School |
| Crime | police.uk (Eng/Wal/NI) · Scottish Gov (Scotland) | street-level ~1-mile radius + percentile (Eng/Wal/NI); council-area recorded-crime rate (Scotland — no Police Scotland on police.uk) |
| Property prices | HM Land Registry Price Paid | recorded sales, averages, by-year trend |
| Deprivation | **IMD 2019** (England) · **WIMD 2025** (Wales) · **SIMD 2020** (Scotland) · **NIMDM 2017** (NI) — all four UK nations | overall + per-domain deciles for the small area |

**How the data works:** schools are pins from official **registers**; every school's **DfE URN** is
the join key to all the enrichment datasets (and **LSOA code** joins the IMD domains). There is
**no database** — all data is committed JSON in `src/data/`, built by Node ETLs in `scripts/etl/`.
See **[`DOCUMENTATION.md`](DOCUMENTATION.md)** for the full architecture, the ETL catalogue (what
each dataset is, its source, and how to refresh it), and the data-sourcing gotchas.

## Honesty by design

- Every panel names its data source; failed/partial upstream responses are surfaced, not hidden,
  and never cached.
- We deliberately show **no catchment** — neither a map area nor a distance estimate. *Real* catchment
  (where a school's pupils actually live) needs restricted NPD data we can't use, and a distance-only
  proxy needs so many caveats it misleads. The radius ring is a distance guide, not a catchment boundary.
  See `DOCUMENTATION.md` §9/§11.
- Crime "vs average" is a **national percentile** benchmark; school grades carry their inspection
  date (Ofsted retired single overall grades in Sept 2024).

## Stack

Next.js 16 · React 19 · TypeScript · Tailwind 4 · Leaflet (dashboard) + Mapbox GL (`/map`) ·
optional Upstash Redis caching. Full details, file map and roadmap in
**[`DOCUMENTATION.md`](DOCUMENTATION.md)**.
```
npm run lint     # ESLint        ·  npm run build  # production build
npm run etl:gias # refresh a dataset (see DOCUMENTATION.md §6 for the full list)
```
