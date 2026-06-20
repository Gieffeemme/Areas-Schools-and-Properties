# Locale — Architecture & Roadmap

## 1. What this is

The MVP vertical slice of a UK area & school intelligence platform. It proves the brief's
success condition end-to-end with **real, live, free data** and an honest UI, before the
heavier data-engineering layers (bulk ETL + PostGIS) are built.

## 2. Request flow

```
PostcodeSearch (client)
   └── GET /api/area?postcode=…&radius=1
         ├── geocodePostcode()  postcodes.io        → centre + facts (IMD, district…)
         └── Promise.allSettled:
               ├── fetchSchools()  Overpass/OSM      → school pins (+ URN, phase)
               ├── fetchCrime()    police.uk         → totals, categories, vs-avg
               └── fetchPrices()   HM Land Registry  → sales, average, by-year
   └── AreaReport JSON → Dashboard renders map + panels
```

Geocoding is the only hard dependency. The three data layers **fail independently**
(`Promise.allSettled`): one outage degrades a single panel, not the page. Successful reports
are cached (optional Upstash) for 6h; **partial/failed reports are never cached** — the same
principle used in the sibling Whatson project.

## 3. File map

```
src/
  app/
    layout.tsx              header/footer, metadata, global theme
    page.tsx                renders <Dashboard/>
    api/area/route.ts       orchestrates the four sources → AreaReport
    globals.css             Tailwind v4 + light theme tokens
  components/
    Dashboard.tsx           client: search, loading/error, layout (Hero, Report, Legend…)
    PostcodeSearch.tsx      input + example chips
    AreaMap.tsx             Leaflet map, school pins coloured by Ofsted
    SchoolsPanel.tsx        list within radius, distance, rating badges
    CrimePanel.tsx          total, vs-average band, category bars
    PricePanel.tsx          average, by-year bars, recent sales
    Card.tsx / RatingBadge.tsx
  lib/
    geocode.ts  schools.ts  crime.ts  prices.ts   (one module per source)
    cache.ts    (optional Redis)  ratings.ts  distance.ts  format.ts  types.ts
  data/
    ofsted-by-urn.json      ETL output (ships empty)
scripts/etl/build-schools.mjs   GIAS → ofsted-by-urn.json
```

## 4. Data sources & the two-bucket reality

The brief's sources split into two very different shapes, which dictates build order:

- **Live, no-key, query-on-demand** — postcodes.io, Overpass, police.uk, Land Registry REST.
  No database needed. **These power the MVP.**
- **Bulk downloads needing an ETL + PostGIS** — GIAS+Ofsted, DfE performance tables, IMD,
  Ofcom broadband, EA flood polygons. Heavier; phased in next.

Note: postcodes.io already returns the **IMD deprivation rank** per postcode, so a basic
deprivation signal is live today without the bulk IMD ingest.

### Caveats (kept honest in the UI)
- **Ofsted**: locations are OSM; ratings need the GIAS ETL (gov endpoint was 5xx at build time).
- **Crime**: police.uk returns a fixed ~1-mile radius for the latest published month
  (~2-month lag). "× average" is a *geographic* benchmark (~9.4 crimes/mo/sq mile); urban areas
  run higher. Police Scotland coverage on police.uk is limited — examples are English postcodes.
- **Prices**: exact-postcode sales only for now; a postcode-sector trend needs aggregation.

## 5. Design decisions

- **Leaflet, not Mapbox (yet).** Free/open, no token, already proven in the sibling repo, and
  fine for pins + a ring + future choropleths. Revisit Mapbox GL when vector-tile heatmaps or
  the B2B embeddable widget justify the token + usage billing.
- **Light, map-first, "Monzo not gov.uk".** Card-based, rounded, mobile-first (panels stack
  under the map below `lg`).
- **No fabricated data.** Where a source is down or unmatched, the UI says so.

## 6. Roadmap → the rest of the brief's MVP

1. **Ofsted ratings live** — run/host the GIAS ETL; add DfE KS2/GCSE/A-level trends (join by URN).
2. **PostGIS/Supabase** — ingest GIAS, IMD, Land Registry, Ofcom, EA flood; move spatial
   queries server-side; precompute price trends by sector.
3. **Heatmap toggle layers** — crime, deprivation, prices, flood (Leaflet choropleth/heat first).
4. **Broadband** — Ofcom Connected Nations lookup by postcode.
5. **Amenities** — extend the existing Overpass call (parks, GP surgeries, supermarkets, transport).
6. **School comparison table** — compare schools within X miles (data already in the report).
7. **Catchment (phase 2)** — replace distance rings with real/estimated catchment polygons.
8. **Rightmove browser extension** — reuse `/api/area` as the data API; inject a compact panel.
9. **Monetisation hooks** — free vs subscription gating; `/api/area` as the B2B widget endpoint.

## 7. Caching & config

Optional Upstash Redis via `KV_REST_API_URL` / `KV_REST_API_TOKEN` (see `.env.local.example`).
Absent ⇒ caching is a no-op and the app hits live APIs directly. Deployable as-is to Vercel.
