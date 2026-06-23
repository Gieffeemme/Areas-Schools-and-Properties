# Locale — UK Area & School Intelligence — Architecture & Data Guide

This is the reference for the whole system. If you're new here, read §3 (the core idea) and §6
(the ETL catalogue) first — they explain 90% of how the app works and where the data comes from.

---

## 1. What this is

A map-first web app: enter a **UK postcode** (or a **school name**) and get a dashboard of the
**schools, crime, property prices and deprivation** around it, plus a deep per-school detail view.
A Locrating-style "area & school intelligence" tool. No login. England-focused for school data
(school registers and DfE performance data are England-only; crime/prices/geocoding are UK-wide).

- **Live:** https://areas-schools-and-properties.vercel.app
- **Repo:** `Gieffeemme/Areas-Schools-and-Properties` — **push to `main` → Vercel auto-deploys.**

---

## 2. Stack & ground rules

- **Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4.**
- **Maps:** Leaflet on the dashboard (`AreaMap`, OSM/CARTO tiles, no token); Mapbox GL on the
  `/map` explorer page (`MapboxMap`, needs `NEXT_PUBLIC_MAPBOX_TOKEN`).
- **No database.** All data is **committed JSON in `src/data/`**, produced by **Node ETL scripts
  in `scripts/etl/*.mjs`**. At request time the API reads those files and joins live geocoding.
  Refreshing data = re-run an ETL, commit the regenerated JSON, push.
- **Caching:** optional Upstash Redis caches successful `/api/area` reports for 6 h (see §10). With
  no Redis env vars it's a no-op.
- ⚠️ **`AGENTS.md`: "This is NOT the Next.js you know."** Next 16 has breaking changes vs older
  versions — read `node_modules/next/dist/docs/` before writing Next-API code (routing, data
  fetching, config). Most app logic is plain React/TS and unaffected.

---

## 3. The core idea: register pins + URN / LSOA enrichment

Everything hinges on two join keys.

**Schools are pins from official registers** (not OpenStreetMap — OSM was removed):

| Layer | File | Source register | Coords | ~Count |
|-------|------|-----------------|--------|--------|
| Schools | `gias.json` | **GIAS** (Get Information About Schools) | precise grid-ref (OSGB36→WGS84, <1 cm) | ~24,900 open England schools — mainstream + special, alternative/PRU & independent (`kind`) |
| Nurseries | `nurseries.json` | **Ofsted Early Years register** | postcode centroid (register has no coords) | ~23,000 |

**The DfE URN is the join key.** Every GIAS school carries its URN natively, so `fetchSchools()`
enriches it with all the `*-by-urn.json` datasets — Ofsted grades, KS2/KS4/KS5 results, Parent
View, pupil census, destinations, workforce, finance. Because URN is native (not fuzzy-matched
like the old OSM approach), enrichment reaches ~all schools (e.g. 97% of secondaries have Ofsted).

**Area deprivation joins by LSOA code.** `geocodePostcode()` reads `codes.lsoa` from postcodes.io
and looks the seven IMD-2019 domain deciles up in `imd-domains-by-lsoa.json`.

State **nursery schools** appear in GIAS too; they're de-duped against the Early Years register by
postcode (GIAS wins — it has a school-framework Ofsted grade).

---

## 4. Request flow

```
PostcodeSearch / school-name search (client)
  └─ GET /api/area?postcode=…&radius=1
       ├─ geocodePostcode()        postcodes.io  → centre, facts (district + LAUA code, region,
       │                                            LSOA, IMD overall decile + 7 domain deciles)
       ├─ Promise.allSettled:
       │    ├─ fetchSchools()       gias + nurseries + report-cards, enriched by URN  → School[]
       │    ├─ fetchCrime()         police.uk     → totals, categories, vs-benchmark
       │    ├─ fetchPrices()        HM Land Registry → sales, averages, by-year
       │    └─ fetchNoise()         Defra WMS GetFeatureInfo → road+rail Lden/Lnight dB at the point
       ├─ nearbyAmenities()         amenities.json + stations.json (sync fs read) → counts + nearest by category (~1 mi)
       ├─ nearestStations()         stations.json (sync fs read) → nearest rail/metro/tram (named, ≤5 mi)
       └─ broadbandForLaua()        broadband-by-laua.json (sync fs read) → Ofcom LA coverage
  └─ AreaReport JSON → <Dashboard/> renders map + panels + detail drawer
```

- **Geocoding is the only hard dependency.** The live layers (schools/crime/prices/noise) **fail
  independently** (`Promise.allSettled`) — one outage degrades a single panel, not the page. Amenities
  and the nearest-station lookup are **committed-data reads** (no Overpass at request time).
- **Only fully-successful reports are cached** (6 h). Partial/failed results are never cached.
- **School-name search:** `GET /api/school-search?q=` → `searchSchools()` ranks GIAS + nurseries
  (exact > prefix > "The "-prefix > substring); picking a result runs the area report at its
  postcode and opens its card.
- **Place-name search:** `GET /api/place-search?q=` → `searchPlaces()` (postcodes.io Places / OS Open
  Names, ranked City > Town > …, deduped with an area disambiguator so "Shoreditch, Greater London" vs
  "Shoreditch, Somerset"). Picking a place runs the report at its centroid via `/api/area?lat=&lng=&label=`;
  `geocodePoint()` reverse-geocodes to the nearest postcode so IMD / prices / broadband still resolve,
  and the **place name shows as the header**. `geocodePostcode()` also falls back to a place lookup, so
  typing "Leeds" and pressing Enter works without picking from the list.
- **Property route (address-led):** the "Check a property" route is its own flow (`PropertyExplorer`):
  `GET /api/address-search?postcode=` lists the specific addresses (EPC register merged with VOA
  council-tax dwellings, so homes with no EPC still appear);
  picking one calls `GET /api/property?postcode=&uprn=&line1=` → `fetchEpcByUprn` + `fetchAddressSales`
  (HM Land Registry, this address) + `fetchCouncilTaxBand` (VOA exact, best-effort) + `fetchFlood`, plus `nearestStations` (committed dataset) and
  geocode facts → a `PropertyReport`. Not cached (single-address, user-initiated). The search box accepts
  a **postcode or a full address** — a postcode is extracted from anywhere in the input (and the leading
  street pre-filters the address list); input with no postcode shows guidance, since the free address
  lookup is postcode-keyed (no OS Places).
- **Map overlay layers** (the `/map` explorer) are separate point-grid endpoints:
  `/api/crime-points`, `/api/deprivation-points`, `/api/flood` — each samples a grid in the radius
  and bulk reverse-geocodes via postcodes.io (no boundary polygons bundled).

---

## 5. Data files (`src/data/`)

All committed; all regenerated by an ETL (§6). Sizes approximate.

| File | Keyed by | Built by | Contents |
|------|----------|----------|----------|
| `gias.json` | (array) | `etl:gias` | school pins: name, postcode, phase, lat/lng, **pupils, gender, type, religion, age range, admissions** |
| `nurseries.json` | (array) | `etl:nurseries` | nursery pins: name, postcode, lat/lng, Ofsted EY grade + sub-grades, places |
| `report-cards-by-urn.json` | URN | `etl:report-cards` | new-framework (Nov 2025+) EY **report cards** scraped from live Ofsted pages: overall band, inspection date, safeguarding, per-area counts. Overrides the stale `nurseries.json` grade when present. |
| `ofsted-by-urn.json` | URN | `etl:schools` | current Ofsted per school: overall grade (when given) + sub-judgements, OR a Nov-2025 **report card** (`card`), OR "no overall grade" for post-Sept-2024 graded inspections; inspection date |
| `ks4-by-urn.json` | URN | `etl:ks4` | Progress 8, Attainment 8, **% grade 5+/4+ in Eng & Maths**, EBacc, disadvantaged P8 |
| `ks5-by-urn.json` | URN | `etl:ks5` | A-level avg grade, points/entry, AAB+, cohort |
| `ks2-by-urn.json` | URN | `etl:ks2` | RWM expected/higher %, reading/writing/maths progress |
| `census-by-urn.json` | URN | `etl:census` | % FSM, EAL, SEN (EHCP / support) |
| `destinations-by-urn.json` | URN | `etl:destinations` | KS4 + KS5 sustained destinations (education/appren/employment/HE) |
| `parentview-by-urn.json` | URN | `etl:parentview` | full Ofsted Parent View survey (all questions, % pos/neg) |
| `workforce-by-urn.json` | URN | `etl:workforce` | pupil:teacher ratio, teacher FTE (latest year) |
| `finance-by-urn.json` | URN | `etl:finance` | spend per pupil, revenue reserve, in-year balance |
| `imd-domains-by-lsoa.json` | LSOA code | `etl:imd` | IMD-2019 decile for each of the 7 domains |
| `council-tax-bands-by-lsoa.json` | LSOA code | `etl:council-tax` | VOA Council Tax band mix — count per band (A–H England, A–I Wales) + total — for the LSOA; England & Wales |
| `council-tax-cost-by-laua.json` | LAUA (ONS) code | `etl:council-tax-cost` | Actual annual council tax (£) per band A–H, all precepts in (area total), per billing authority; England |
| `broadband-by-laua.json` | LAUA code | `etl:broadband` | Ofcom fixed-broadband coverage % per local authority (superfast / ultrafast / full-fibre / gigabit / below-USO) |
| `amenities.json` | category → points | `etl:amenities` | everyday-amenity coordinates (supermarkets, convenience, GPs, pharmacies, parks, gyms, cafés/restaurants) across the UK, from OSM — powers the nearby-amenity counts (the station count reuses `stations.json`; bus stops intentionally excluded) |
| `stations.json` | (array) | `etl:stations` | UK rail/metro/tram/light-rail stations (name, kind, lat/lng) from OSM — powers the nearest-station lookup |
| `benchmarks.json` | — | `etl:benchmarks` | sampled national crime & price distributions (for percentiles) |

---

## 6. ETL catalogue (`scripts/etl/*.mjs`)

Each script is self-contained: `npm run etl:<name>`. Most also accept a year or a local file as
an argument (see the script header). They write straight into `src/data/`. **The exact source
column codes live in each script's header docstring** — the table below is the map.

> **Naming gotcha:** `etl:schools` (`build-schools.mjs`) builds **Ofsted ratings**
> (`ofsted-by-urn.json`), *not* the school register. The school **register/pins** are
> `etl:gias` (`build-gias.mjs`). Historical name; don't confuse them.

| Command | Output | Source |
|---------|--------|--------|
| `etl:gias` | `gias.json` | GIAS bulk "all establishments" CSV (`ea-edubase-api-prod.azurewebsites.net/.../edubasealldataYYYYMMDD.csv`). Open schools; phase mapped; Easting/Northing → WGS84 via `osgbToWgs84`. Keeps NumberOfPupils, Gender, TypeOfEstablishment, ReligiousCharacter, Statutory{Low,High}Age, AdmissionsPolicy. **Special / alternative (PRU) / independent** schools file under GIAS phase "Not applicable" — admitted by establishment type, phase derived from the age range, tagged `kind`; Welsh + universities/overseas excluded. |
| `etl:nurseries` | `nurseries.json` | Ofsted "Childcare providers and inspections" MI (Early Years register), gov.uk statistical-data-sets. Active non-domestic EY settings; childminders dropped; postcode-geocoded via postcodes.io. |
| `etl:report-cards -- --discover` | `report-cards-by-urn.json` | **Scraped** from live `reports.ofsted.gov.uk/provider/16/{urn}` pages — the new Nov-2025 report-card grades the bulk MI doesn't carry yet. `--discover` walks the date-desc childcare search (new-framework reports cluster at the front) and stops at the framework boundary, so it touches only the new-framework nurseries, not all ~23k. |
| `etl:schools` | `ofsted-by-urn.json` | Ofsted **"state-funded schools - latest inspections"** MI **CSV** (refreshed monthly; auto-picks the newest). Each school's CURRENT inspection across all three frameworks (report card / OEIF graded / ungraded). **Merges over the existing file** so pre-2019 grades the new MI dropped are preserved (current always wins). |
| `etl:ks4` | `ks4-by-urn.json` | DfE **Compare School Performance** `download-data?filters=KS4` (CSV). `P8MEA`, `ATT8SCR`, `PTL2BASICS_95/_94`, `PTEBACC_*`, `P8MEA_FSM6CLA1A`. |
| `etl:ks5` | `ks5-by-urn.json` | Compare School Performance `filters=KS5`. A-level points/grade/AAB+/cohort. |
| `etl:ks2` | `ks2-by-urn.json` | Compare School Performance `filters=KS2`. `PTRWM_EXP/HIGH`, `READPROG/WRITPROG/MATPROG`. |
| `etl:census` | `census-by-urn.json` | Compare School Performance `filters=CENSUS`. `PNUMFSMEVER`, `PNUMEAL`, `PSENELSE`, `PSENELK`. |
| `etl:destinations` | `destinations-by-urn.json` | Compare School Performance `filters=KS4DESTINATION` / `KS5DESTINATION`. |
| `etl:parentview` | `parentview-by-urn.json` | Ofsted "Parent View: management information" **xlsx**, "School Level Data" sheet. |
| `etl:workforce` | `workforce-by-urn.json` | **EES** (Explore Education Statistics) data set *"Pupil to teacher ratios - school level"* `f63c85d9-…`, CSV at `explore-education-statistics.service.gov.uk/data-catalogue/data-set/{id}/csv` (~62 MB, all years/geographies → keep `geographic_level=School`, latest year per URN). |
| `etl:finance` | `finance-by-urn.json` | **FBIT** (Financial Benchmarking & Insights Tool) workbooks `financial-benchmarking-and-insights-tool.education.gov.uk/files/CFR_<yr>_Full_Data_Workbook.xlsx` (maintained) + `AAR_<yr>_download.xlsx` (academies). Both pre-compute Total Expenditure / Revenue Reserve / In-year Balance + pupils; AAR multi-trust rows deduped by URN. |
| `etl:imd` | `imd-domains-by-lsoa.json` | **MHCLG** English Indices of Deprivation 2019, **File 7** ("all ranks, deciles and scores"), CSV at `assets.publishing.service.gov.uk/media/5dc407b4…/File_7_…csv`. Keeps the 7 domain deciles by LSOA-2011 code. |
| `etl:council-tax` | `council-tax-bands-by-lsoa.json` | **VOA** "Council Tax: stock of properties", table **CTSOP4.1** (the LSOA-level breakdown). Zip linked from the annual release page (`gov.uk/government/statistics/council-tax-stock-of-properties-<year>`, default 2025, snapshot 31 Mar); the ETL scrapes the asset link, shells `unzip`, keeps `geography==LSOA` rows and sums `all_properties` per band. Counts VOA-rounded to 10 (`-` = nil). Accepts a year or a local `.csv`/`.zip` arg. |
| `etl:council-tax-cost` | `council-tax-cost-by-laua.json` | **MHCLG** "Council tax levels set by local authorities in England", **Table 9** of the "Tables 1-9" **ODS** on the annual release page (`gov.uk/.../council-tax-levels-set-by-local-authorities-in-england-2026-to-2027`). Per billing authority: the area-total Band A–H £ (incl. county/police/fire/parish precepts), keyed by ONS code. The project's `xlsx` can't read this ODS (error cells) so the ETL parses `content.xml` directly. England only; ~296 authorities. |
| `etl:broadband` | `broadband-by-laua.json` | **Ofcom Connected Nations** (CN2024, OGL) "fixed coverage: UK nations" **zip** → the LAUA-level CSV (`…fixed_laua_coverage…`); the ETL shells `unzip`. Per-postcode is 121 area CSVs (~2.5M rows, too big to commit), so the LA aggregate is used; key = LAUA ONS code (postcodes.io `codes.admin_district`). |
| `etl:amenities` | `amenities.json` | **OSM via Overpass** (one-off, at build time): national per-category queries (supermarket, convenience, doctors, pharmacy, park, fitness_centre, restaurant, cafe) with `out center;` (coords only; a single national query 504s for polygon-heavy categories like parks, so those fall back to latitude-banded queries). Moves the per-request Overpass amenity lookup to build time so `nearbyAmenities` is a committed-data read. **Bus stops excluded** (~370k, low signal); the station count reuses `stations.json`. |
| `etl:stations` | `stations.json` | **OSM via Overpass** (one-off, at build time): a UK-bbox query for `railway=station\|halt\|tram_stop`, classified rail/metro/light_rail/tram from the same tags the runtime used, deduped to one point per station (~4,300). Moves the (rate-limit-prone) Overpass call out of the request path so `nearestStations` is a committed-data read. Tries two Overpass mirrors; refuses to write a truncated (<2,000) result. |
| `etl:benchmarks` | `benchmarks.json` | Samples N random English postcodes (postcodes.io) → police.uk crime counts + Land Registry LA average prices → sorted national distributions. `N=300 npm run etl:benchmarks`. |

**Two DfE platforms are confusingly distinct** (this ate a session — see §9): KS2/KS4/KS5/CENSUS
come from *Compare School Performance*; **workforce** is on *EES*; **finance** is on *FBIT*. They
are not interchangeable and use different download mechanisms.

---

## 7. Code map

```
src/
  app/
    page.tsx              → <Dashboard/>            (home: postcode/school search → report)
    compare/page.tsx      → <Compare/>              (compare areas OR schools side by side)
    map/page.tsx          → <MapExplorer/>          (Mapbox explorer with overlay layers)
    layout.tsx, globals.css
    api/
      area/route.ts            geocode + schools + crime + prices + amenities + transport + broadband → AreaReport (cached 6h)
      schools/route.ts         fetchSchoolsByIds() — full School objects by id (school compare)
      school-search/route.ts   searchSchools() autocomplete
      place-search/route.ts    searchPlaces() autocomplete (town/city/borough, postcodes.io Places)
      crime-points/route.ts    point-grid crime layer (police.uk)
      deprivation-points/route.ts  point-grid IMD layer (postcodes.io)
      flood/route.ts           EA flood-risk lookup
      epc/route.ts             fetchEpc() — domestic EPC bands for a postcode (MHCLG; server-side token)
      address-search/route.ts  addresses at a postcode — EPC register (fetchAddresses) MERGED with VOA council-tax dwellings (fetchVoaAddresses), so homes with no EPC still appear (best-effort)
      property/route.ts        per-property report for ONE address (EPC band + VOA band + LR sale history + flood + nearest stations)
  lib/   (one concern each)
    geocode.ts      postcode → centre + AreaFacts (IMD overall + domains); searchPlaces() (place suggestions) + geocodePoint() (place → facts via reverse-geocode)
    schools.ts      fetchSchools() / fetchSchoolsByIds() (GIAS+nurseries, URN-enriched; runtime fs reads), searchSchools()
    reportCard.ts   new-framework EY report-card model + gradeDisplay()/gradeRank() (prefer report card over legacy grade)
    imd.ts  imdDomainsForLsoa()   ·  broadband.ts  broadbandForLaua()
    councilTax.ts councilTaxForLsoa()  (VOA band mix for the LSOA; runtime fs read like imd.ts)
    crime.ts        fetchCrime()  ·  prices.ts  fetchPrices()/fetchAddressSales()  ·  flood.ts  fetchFlood()  ·  transport.ts  nearestStations() (nearest rail/metro/tram from committed stations.json) + stationsData()  ·  amenities.ts  nearbyAmenities() (counts from committed amenities.json + stations.json)
    epc.ts  fetchEpc() (postcode summary) + fetchAddresses() / fetchEpcByUprn() (property picker)  ·  voa.ts  fetchCouncilTaxBand() (exact band, one address) + fetchVoaAddresses() (postcode dwelling list for the picker) — both best-effort scrapes sharing voaResultsHtml()
    benchmark.ts    crime/price national-percentile helpers   ·  cache.ts  optional Upstash
    phase.ts        phase filter (PhaseFilter, matchesPhase, phaseTabs)
    schoolFilters.ts SchoolFilters model + applyFilters() (phase/gender/faith/grammar/Ofsted)
    routes.ts       Route = "area" | "property"  ·  ratings.ts / scoreColors.ts colour scales  ·  mapMarkers.ts  pin shape (phase) + colour/label (grade), shared by AreaMap/MapboxMap/legend
    distance.ts     haversine miles  ·  links.ts  DfE/Ofsted URLs  ·  types.ts  all shared types
  components/
    Dashboard.tsx        search, loading/error, Map/List toggle, Report + SidePanels
    AreaMap.tsx          Leaflet map: radius ring + school pins (shape = phase, colour = grade; popup name → detail drawer)
    SchoolControls.tsx   phase chips + collapsible Filters (Ofsted/gender/faith/grammar)
    PhaseChips.tsx       the phase chip row (used inside SchoolControls)
    SchoolsPanel.tsx     league-table list: sort + shortlist (★, localStorage)
    SchoolCard.tsx       list card (pills: Ofsted, P8, GCSE%, Parent View; pupils in meta)
    SchoolDetail.tsx     the per-school drawer: Details, Ofsted, GCSE, A-level, KS2, Destinations,
                         Pupil composition, Workforce, Finances, Parent View (full breakdown)
    DeprivationPanel · CrimePanel · PricePanel · AmenitiesPanel · TransportPanel · BroadbandPanel · RankingsPanel  (area panels)
    PropertyExplorer  (the "Check a property" route: postcode → pick exact address → per-property report; EPC A–G scale, council-tax + neighbourhood bar, tenure+type, sold-price growth, location map)
    PropertyMap  (lean single-marker Leaflet map on the property report; postcode centroid, CARTO tiles)
    PropertyChecks (postcode-area checks - flood/prices/tenure/EPC/council-tax with band bars; in the area route's Area panels) · RouteSelector · PostcodeSearch
    MapExplorer · MapboxMap · LayerControl   (the /map page; LayerControl carries the crime-category filter)
    Compare (Areas|Schools tabs) · AreasCompare · CompareTable · SchoolsCompare · SchoolCompareTable · SchoolSlotInput  (/compare)
    Card · Pill · RatingBadge · ParentViewBadge · Progress8Badge   (primitives)
```

`AreaMap` is **keyed on `centre + radius + layout + filter signature`** so the (mount-only) Leaflet
map remounts and re-fits when any of those change.

---

## 8. Features (dashboard)

- **Search:** postcode, **school name, or place** (town / city / borough — autocomplete; places via
  postcodes.io Places, so a postcode isn't needed); adjustable **radius** (½–5 mi).
- **Focus filter** on the area report - **Schools · Area · Schools + area** - toggles which side panels
  show; the **Property checks** panel (flood, sold prices, tenure, EPC, council-tax band, each with the
  band distribution bars) sits in the **Area** set.
- **Map / List view toggle**; phase chips + a **Filters** panel (Ofsted, gender, faith, grammar,
  school type — special / independent / alternative) that drive the **map pins and the list together**.
  Map pins encode **Ofsted grade as colour and school phase as marker shape** (circle = primary, square =
  secondary, triangle = sixth-form/college, diamond = all-through, hexagon = nursery; see the legend).
- **League table:** sort by distance, name, Ofsted, P8, Attainment 8, GCSE 5+ E&M, KS2, A-level,
  Parent View; **shortlist** (★, localStorage). Metric sorts fall back to Ofsted then distance.
- **School detail drawer:** Details, **Ofsted** — the new Nov-2025 **report card** (5-band scale +
  safeguarding + per-area counts) where one exists, otherwise the legacy grade + sub-grades (shown
  with a caveat note linking to the live Ofsted report — see §9) — GCSE
  (incl. 5+/4+ E&M), A-level, KS2, Destinations, Pupil composition, **Workforce**, **Finances**, full
  **Parent View**. Nurseries deep-link to the live Ofsted page.
- **Area panels:** **Area rankings** (national-percentile summary), **Deprivation (IMD 2019)**
  7-domain breakdown, Crime (vs national percentile), **Amenities** (committed OSM dataset — supermarkets,
  convenience, GPs, pharmacies, parks, gyms, dining, + the station count), **Transport** (the nearest
  rail/metro/tram station, named — committed OSM dataset), **Broadband** (Ofcom coverage), **Noise**
  (Defra road & rail, England — Lden/Lnight
  at the point), Property prices, Property checks (EA flood + tenure + EPC energy ratings + **council-tax
  band** — the VOA band mix for the surrounding neighbourhood/LSOA (not a single address), now with MHCLG's all-in ≈£/yr for the typical band).
- **Check a property (per-address report):** the "Check a property" route asks for a **postcode**, lists the
  **specific addresses** at it (EPC register), and on pick returns **that property's** report - EPC band,
  **council-tax band + the actual £/yr** (VOA band + MHCLG all-in cost, with the neighbourhood mix bar), its **sold-price history + tenure** (HM
  Land Registry), **flood**, and the **nearest train/tram/metro stations** (OpenStreetMap, named + distance) - via `PropertyExplorer` + `/api/property`. An opt-in **"See the
  neighbourhood"** toggle (collapsed by default) fetches the area report for the postcode and shows the
  area panels (schools, crime, deprivation, amenities, broadband, noise, prices) inline.
- **Compare areas *or* schools** side by side (`/compare`, name typeahead; "Compare shortlisted" from
  the list). **`/map`** explorer: overlay layers + a **crime-category filter** and per-domain IMD recolour.

---

## 9. Data-sourcing gotchas (read before re-sourcing anything)

These cost real time to discover — don't re-learn them:

- **gov.uk / DfE / Ofsted / EES / FBIT WAF-block plain `curl` / `WebFetch` (403).** Use **node
  `fetch` with a browser `User-Agent`** (every ETL does). A `curl -I` / HEAD request also 403s even
  with a UA — use GET.
- **Three different DfE platforms, not interchangeable:** `compare-school-performance.service.gov.uk
  /download-data?filters=` serves only **KS2 / KS4 / KS5 / CENSUS** (+ `KS4DESTINATION` /
  `KS5DESTINATION`). `WORKFORCE` / `SWF` / `CFR` / `FINANCE` / `SPINE` / `ABSENCE` return 404/400 —
  **workforce lives on EES**, **finance on FBIT** (two xlsx regimes: CFR maintained + AAR academies).
- **`/api/area` caches successful reports for ~6 h by `postcode+radius`.** To verify a fresh deploy,
  query a **cache key you haven't used since the deploy** (a new postcode or a different radius) —
  otherwise you get the pre-deploy report. (A no-op without Redis env vars.)
- **postcodes.io gives the LSOA *code* under `codes.lsoa`**; `result.lsoa` is the *name*. The IMD
  domains join needs the code.
- **`xlsx` is a project dependency** — use `import * as XLSX from "xlsx"; XLSX.read(buf, {type:"buffer"})`
  for the Ofsted/Parent View/FBIT workbooks.
- **Catchment areas** (the big remaining gap) need **restricted NPD pupil-residence microdata** via
  the ONS Secure Research Service — *not* free/open. Only approximable. Don't promise a clean build.
- **Per-school subjects aren't cleanly available either.** DfE's KS4 subject datasets (EES) are
  **national/aggregate** (no per-school URN), and the bulk KS4 download is summary-only. Per-school
  subject results render on the compare-school-performance *website* but aren't bulk-published — so
  "Subjects" would be a per-school scrape, disclosure-suppressed for small entries. Treated as gated.
- **School Ofsted: Ofsted dropped the single overall grade (Sept 2024) and added report cards (Nov
  2025) — don't pin to an old MI snapshot.** `etl:schools` reads the latest "state-funded - latest
  inspections" CSV and takes each school's CURRENT inspection: a pre-Sept-2024 graded overall →
  `rating`; a post-Sept-2024 graded inspection → sub-judgements but **no overall** (`ofstedNoOverall`,
  shown as "No overall grade"); a Nov-2025+ inspection → a `card` (5-band areas, rendered via the
  shared report-card UI). The old build pinned to the Aug-2024 snapshot and so showed years-old grades
  for any school re-inspected since — e.g. a stale, defamatory "Inadequate" for a school now graded
  Good. The current MI format dropped pre-2019 grades, so the ETL **merges over the committed file**
  to keep them (current always wins). Grade codes: 1 Outstanding · 2 Good · 3 RI · 4 Inadequate.
- **A legacy single-word Ofsted grade isn't necessarily stale.** Ofsted's new *report cards* exist
  only for inspections from the **Nov-2025 cutover** onward; a provider last inspected before then
  keeps a legacy graded report (overall + the four EIF judgements: quality of education, behaviour &
  attitudes, personal development, leadership & management) — exactly what the bulk MI carries and the
  drawer shows. `etl:report-cards --discover` overrides the bulk grade **only** when a genuine
  post-cutover report card exists, so a recent legacy grade (e.g. a nursery inspected mid-2025) is
  *current*, not lag. The drawer carries a **blanket caveat note** ("Grade is from Ofsted's bulk
  data… open the live report to check") — accurate as a general hedge, but it can read as if a fresher
  grade is hidden when the shown grade is already the latest. To confirm a provider's true latest
  status: open `reports.ofsted.gov.uk/provider/16/{urn}`, take the newest *Inspection* PDF (file IDs
  under `files.ofsted.gov.uk/v1/file/…`), and compare. (Checked Bubbles Nurseries `EY494343`: bulk and
  live both "Requires improvement", 1 Jul 2025 — no discrepancy.)
- **Large datasets are read at RUNTIME, never `import`-bundled.** `src/lib/schools.ts` and
  `src/lib/imd.ts` load `src/data/*.json` via `fs` (memoised per cold start); `next.config.ts` →
  `outputFileTracingIncludes` copies those files into each server route's trace (the read paths are
  dynamic, so `@vercel/nft` can't find them automatically). This **fixed the old build OOM**: when the
  JSON was statically imported, `next build`'s "Running TypeScript" step hung on Vercel's 8 GB machine
  inferring literal types for ~26 MB of JSON. The in-build type-check is now **enabled** (no more
  `typescript.ignoreBuildErrors`) and that step runs in ~1.5 s. **Rule for future work:** never add a
  static `import x from "@/data/big.json"` into app code — read it at runtime and list it under
  `outputFileTracingIncludes`, or the OOM returns. (`benchmarks.json`, 4 KB, is the lone exception,
  still imported.) Still run `tsc --noEmit` for fast local checks.
- **Defra strategic noise is a WMS raster, not vector contours.** The Round 4 (2021) road/rail maps
  are served from Defra's GeoServer (`environment.data.gov.uk/spatialdata/<slug>/wms`); `fetchNoise()`
  reads the modelled dB at the point via **`GetFeatureInfo`** (JSON → `GRAY_INDEX`; `0` = below the
  40 dB/35 dB cutoff → "below threshold"). So it's a runtime point-query — no ETL, no committed
  geometry, no point-in-polygon. Use `crs=CRS:84` (lon,lat) to dodge the WMS 1.3.0 EPSG:4326
  axis-order trap; road and rail are in **different workspaces** (rail lives in the `noise-data`
  workspace, road in `road-noise-all-metrics-england-round-4`). The legacy `/arcgis/rest/` paths are
  dead (500). It's an **England-only** dataset (out-of-coverage points return empty / `0` / a negative
  sentinel inconsistently), so `/api/area` calls `fetchNoise()` only when `facts.country === "England"`
  and the dashboard hides the panel elsewhere.
- **EPC data moved (May 2026) — old API retired.** `epc.opendatacommunities.org` was retired and now
  301-redirects to an HTML site (so the old `…/api/v1/domestic/search` silently returns a web page).
  EPC is now MHCLG's **"Get energy performance of buildings data"** at
  `api.get-energy-performance-data.communities.gov.uk/api/domestic/search`, authenticated with
  **`Authorization: Bearer <token>`** (token from your account page → env **`EPC_API_KEY`**,
  server-only via `fetchEpc()`/`/api/epc`, never sent to the browser). It returns `data[]` with
  `currentEnergyEfficiencyBand` (A–G); a 404 `{data:{error}}` just means "no certificates for that
  postcode". The old API used Basic `base64(email:key)` — a *different* scheme; the api.gov.uk
  catalogue still lists the dead endpoint, so don't trust it.
- **Council Tax bands: there is no per-property open API — but the VOA bulk stats are LSOA-level open
  data, which is the right source here.** The "Check your Council Tax band" service
  (`tax.service.gov.uk/check-council-tax-band`) is a *stateful* Play form (GET form → grab the `mdtp`
  session cookie + `csrfToken` → POST `postcode` → 303 to a results page keyed by an opaque token →
  GET results; the band is the 2nd `<td>` per row). It **rate-limits hard (HTTP 429 after ~15 requests
  from one IP)**, so a runtime scrape is flaky under any real traffic — fine only with durable caching
  + graceful degradation. We deliberately **avoided the scrape** and instead committed the VOA **"Council
  Tax: stock of properties" table CTSOP4.1** (`etl:council-tax`), which gives band counts **down to
  LSOA** — the same join key the report already has — so the check is robust, instant and rate-limit-
  free, at the cost of being a *neighbourhood* (LSOA) distribution rather than a single address. Bands
  are England A–H, **Wales A–I** (Wales rebanded in 2003); Scotland/NI aren't in CTSOP (different
  systems), so `councilTaxForLsoa` returns undefined there and the row falls back to "soon". CTSOP4.x is
  the LSOA table; 4.1 is "by band" — the file is 65 MB (band × build-period), but we keep only band ×
  `all_properties`, so the committed JSON is ~2.7 MB.
- **Per-property report: what's free vs not.** A true type-the-address autocomplete needs PAF/AddressBase,
  which is **paid** (OS Places is *excluded* from OS Data Hub's free credits — 60-day/2,000-call trial only),
  so the property route is **postcode → pick the exact address**, sourced free from the **EPC register**
  (`fetchAddresses`; covers only certificated dwellings). EPC's **full certificate** (floor area, heating,
  potential rating) is a **separate "Domestic Certificates API"** the Search-API key doesn't carry (its
  `/certificate/{lmk}` routes 404), so per-property EPC is **band + lodgement date** only for now. The exact
  council-tax band is the **VOA scrape matched by building number** (best-effort, 429-prone) with an
  LSOA-typical fallback; sold-price history filters the postcode's LR sales by PAON (numbered houses match
  cleanly, flats are approximate); flood uses the postcode centroid (no exact per-building point without OS
  Places). `/api/property` reads the committed LSOA JSON via geocode, so it's listed in
  `outputFileTracingIncludes`. **Transport** (on both the property and area reports) is the nearest
  rail/metro/tram station, from a **committed dataset** (`stations.json`, built once from OSM by
  `etl:stations` — ~4,300 UK stations classified rail/metro/light_rail/tram). The runtime lookup
  (`nearestStations`) is a memoised `fs` read + straight-line scan (≤5 mi, deduped by name+kind) — NO
  per-request Overpass, so it's instant and rate-limit-free. (The earlier runtime fetch was flaky
  because the public Overpass instance rate-limits under load; the network risk now lives at ETL time,
  where it's one-off and retryable.) A *connectivity* signal distinct from the amenities walkable density
  count (stations within 1 mile). Door-to-door commute *times* would need a paid routing/journey-planner
  API, deliberately out of scope. `/api/area` still skips caching when `transport` is null, but with
  committed data that only happens if the dataset file is absent (a deploy bug), not from flakiness.
  **Amenities** moved to committed data the same way (`etl:amenities` → `amenities.json`; bus stops
  dropped, the station count reuses `stations.json`), so the app now makes **no runtime Overpass call at
  all** — the only OSM dependency is the two build-time ETLs (`etl:stations`, `etl:amenities`).

For agents working in this repo: the Bash cwd can drift back to a sibling project, so run ETLs /
`tsc` from the repo root (prefix `cd`) or by absolute path; verify deploys with `curl` (the
in-tool browser preview is sandboxed and can't load this app).

> **⚠️ Known setup issue — TO ADDRESS.** These sessions have been run from an *unrelated* sibling
> workspace (the `Whatson` project), with `area-intel` only an additional working directory. Two
> consequences leak from that: (1) the built-in **Preview** integration is bound to the Whatson root,
> so it can't load this app and just nags to start a preview server after every edit (harmless, but
> noise — ignore it); (2) `area-intel`-specific permissions (`curl localhost`, `node` scripts over
> `area-intel/src/data`, the Vercel URL, …) have accumulated in **`Whatson/.claude/settings.local.json`**,
> tangling two projects that have nothing in common. **Fix (later):** run `area-intel` from its own
> workspace root with its own `.claude/` settings, and prune the area-intel entries out of Whatson's
> local settings. Until then: verify via `tsc` / `build` / `curl` + the live URL.

---

## 10. Run, refresh, deploy

```bash
npm install
npm run dev            # http://localhost:3000  (no keys needed; /map needs NEXT_PUBLIC_MAPBOX_TOKEN)
npm run build          # production build
npm run lint           # ESLint (a few pre-existing warnings in MapboxMap/PropertyChecks are known)
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json   # typecheck (the real one — build skips it, §9)
```

- **Refresh data:** re-run the relevant `npm run etl:*` when the DfE/Ofsted/MHCLG source publishes a
  newer year, then **commit the regenerated JSON** and push. ETL outputs are committed artifacts.
- **Caching config:** Upstash via `KV_REST_API_URL` / `KV_REST_API_TOKEN` (see `.env.local.example`).
- **Deploy:** push to `main` → Vercel builds and deploys automatically. Use the bare production URL,
  not `…-<hash>.vercel.app` preview URLs (they pin to old commits).

---

## 11. Roadmap

**Shipped — Locrating free-tier parity + more:** register-based pins, Ofsted + sub-grades **and the
new Nov-2025 EY report cards** (scraped via `etl:report-cards`; preferred over the stale bulk MI),
KS2/GCSE/A-level (incl. GCSE 5+ E&M), Parent View full breakdown, destinations, composition,
**workforce**, **finances**, GIAS metadata + map filters, **IMD 7-domain breakdown** + per-domain map
layers, crime vs benchmark, sold-price trends, EA flood, Map/List, search-by-name, the
**runtime-load build cleanup** (datasets read at runtime; in-build type-check re-enabled),
**compare areas *or* schools**, and Tier-1 area layers: **amenities/POIs** (committed OSM dataset), **broadband**
(Ofcom), **area rankings**, **crime-category filter** on the map, and **environmental noise** (Defra
strategic noise mapping, Round 4), a **council-tax band mix** (VOA stock-of-properties, by LSOA), **nearest-station transport** (a committed UK rail/metro/tram dataset from OSM via `etl:stations`, named — on the property *and* area reports), and a **complete school register** — special, alternative/PRU &
independent schools (filed by GIAS under phase "Not applicable") are now admitted instead of silently
dropped (+~4,100 schools), tagged by `kind`, filterable by type, and shown honestly (independent =
ISI-inspected, no Ofsted grade).

**Remaining (free data):** none outstanding — the Tier-1 set is complete. (The last of them, **Defra
noise**, was expected to need committed GIS contours + point-in-polygon, but Defra serves the Round 4
maps as a GeoServer **WMS raster**, so `fetchNoise()` does a live `GetFeatureInfo` point-query — no
ETL and no committed data, like crime/prices/amenities.)

**Gated / not cleanly free (need restricted or non-bulk data — §9):** **catchment areas**,
**feeder schools** and **named destination schools** (restricted NPD pupil-flow microdata);
**per-school subjects** (DfE subject data is national-only, not bulk-published per school);
**11+ oversubscription** (published LA-by-LA, messy); **door-to-door commute times** (the nearest
*station* is shipped free via OSM, but routed journey times need a paid routing/journey-planner API).

**Follow-up — non-England nations.** Each needs its **own register, inspectorate and
performance/deprivation data**, and there is **no Ofsted-style single grade** outside England, so none
slot into the existing GIAS/Ofsted/DfE pipeline:

- **Wales** — *present in GIAS but excluded* (the schools are there, but carry no statutory age fields
  to derive phase from, and aren't covered by our England Ofsted/DfE enrichment). Needs a Welsh
  pipeline: **Estyn** inspections + **Welsh-Government** results + **WIMD** deprivation.
- **Scotland** — *not in GIAS at all* (no Scotland group; 0 Scottish schools in the file). Needs the
  **Scottish Government** school register, **Education Scotland** inspections (quality-indicator
  framework, not graded), **SQA/Insight** results + **SIMD**. Note police.uk also has no Police
  Scotland data, so the crime layer is England/Wales/NI only.
- *(Northern Ireland is the same shape — not in GIAS; would need the **DENI** register + **ETI**
  inspections + DENI results + **NIMDM**.)*

---

## 12. About `pipelines/` and `supabase/`

Those folders describe an **alternative Python + Postgres/PostGIS** ingestion approach that is **not
the live data path.** The running app uses the **Node ETLs + committed JSON** documented above (no
database). Treat `pipelines/` as exploratory/superseded unless a deliberate decision is made to move
spatial data into Postgres.
