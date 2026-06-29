# Locale — UK Area & School Intelligence — Architecture & Data Guide

This is the reference for the whole system. If you're new here, read §3 (the core idea) and §6
(the ETL catalogue) first — they explain 90% of how the app works and where the data comes from.

---

## 1. What this is

A map-first web app: enter a **UK postcode** (or a **school name**) and get a dashboard of the
**schools, crime, property prices and deprivation** around it, plus a deep per-school detail view.
A Locrating-style "area & school intelligence" tool. No login. Coverage is **deepest in England**
(school registers + DfE performance data are England-only) and thins toward the other nations — see
the matrix below.

- **Live:** https://areas-schools-and-properties.vercel.app
- **Repo:** `Gieffeemme/Areas-Schools-and-Properties` — **push to `main` → Vercel auto-deploys.**

### Coverage by nation

Free open data is published per-nation by different bodies, so coverage is heterogeneous. What a user gets:

| Layer | England | Wales | Scotland | N. Ireland |
|-------|:---:|:---:|:---:|:---:|
| School pins + phase | ✓ GIAS | ✓ Welsh register | ✗ | ✗ |
| School Ofsted grade + DfE results | ✓ | ✗ (Estyn: no grade → My Local School link) | ✗ | ✗ |
| Nurseries (Ofsted Early Years) | ✓ | ✗ | ✗ | ✗ |
| Deprivation (per-domain) | ✓ IMD 2019 | ✓ WIMD 2025 | ✓ SIMD 2020v2 | ✗ (NIMDM = next) |
| Street crime (police.uk) | ✓ | ✓ | ✗ no Police Scotland | ✓ |
| Sold prices (Land Registry PPD) | ✓ | ✓ | ✗ (Registers of Scotland) | ✗ |
| Census demographics + income | ✓ | ✓ | ✗ (NRS) | ✗ (NISRA) |
| Council-tax bands | ✓ | ✓ | ✗ | ✗ |
| Broadband + mobile (Ofcom) | ✓ | ✓ | ✓ | ✓ |
| Air quality (Defra PCM) | ✓ | ✓ | ✓ | ✗ (Irish grid) |
| Noise · flood · bathing water · CQC · EPC | ✓ | ✗ | ✗ | ✗ |
| Planning constraints (planning.data.gov.uk) | ✓ | ✗ | ✗ | ✗ |
| Amenities · stations · EV · planning apps · geocoding | ✓ | ✓ | ✓ | ✓ |

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
| Welsh schools | `welsh-schools.json` | **Welsh Government** "Address list of schools" | postcode centroid | ~1,540 Wales schools — `nation:"Wales"`, sector→phase, pupils, Welsh-medium; no Ofsted/results (Estyn → My Local School) |
| Nurseries | `nurseries.json` | **Ofsted Early Years register** | postcode centroid (register has no coords) | ~23,000 |

**The DfE URN is the join key.** Every GIAS school carries its URN natively, so `fetchSchools()`
enriches it with all the `*-by-urn.json` datasets — Ofsted grades, KS2/KS4/KS5 results, Parent
View, pupil census, destinations, workforce, finance. Because URN is native (not fuzzy-matched
like the old OSM approach), enrichment reaches ~all schools (e.g. 97% of secondaries have Ofsted).

**Area deprivation joins by small-area code.** `geocodePostcode()` reads the small-area code from
postcodes.io and looks up the per-domain deciles for the right nation: England → IMD-2019 by
`codes.lsoa` (`imd-domains-by-lsoa.json`), Wales → WIMD-2025 by `codes.lsoa` (`wimd-by-lsoa.json`),
Scotland → SIMD-2020v2 by `codes.lsoa11` (`simd-by-datazone.json`). Each dataset is keyed to a single
nation's codes, so the lookups self-gate — only one populates per postcode.

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
  picking one calls `GET /api/property?postcode=&uprn=&line1=` → `fetchEpcByUprn` (band) + `fetchFullCertificate` (full cert by LMK) + `fetchAddressSales`
  (HM Land Registry, this address) + `fetchCouncilTaxBand` (VOA exact, best-effort) + `fetchFlood` + `fetchPlanning` (PlanIt, nearby applications), plus `nearestStations` (committed dataset) and
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
| `gias.json` | (array) | `etl:gias` | school pins: name, postcode, phase, lat/lng, **pupils, gender, type, religion, age range, admissions** (England) |
| `welsh-schools.json` | (array) | `etl:welsh-schools` | Welsh school pins: name, postcode, lat/lng, phase (from sector), `kind`, pupils, religion, **Welsh-medium language**, school number (Wales) |
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
| `imd-domains-by-lsoa.json` | LSOA code | `etl:imd` | IMD-2019 decile for each of the 7 domains (England) |
| `wimd-by-lsoa.json` | LSOA-2021 code | `etl:wimd` | WIMD-2025 overall rank/decile + decile for each of the 8 Welsh domains (Wales) |
| `simd-by-datazone.json` | data-zone-2011 code | `etl:simd` | SIMD-2020v2 overall rank/decile + decile for each of the 7 Scottish domains (Scotland) |
| `council-tax-bands-by-lsoa.json` | LSOA code | `etl:council-tax` | VOA Council Tax band mix — count per band (A–H England, A–I Wales) + total — for the LSOA; England & Wales |
| `council-tax-cost-by-laua.json` | LAUA (ONS) code | `etl:council-tax-cost` | Actual annual council tax (£) per band A–H, all precepts in (area total), per billing authority; England |
| `broadband-by-laua.json` | LAUA code | `etl:broadband` | Ofcom fixed-broadband coverage % per local authority (superfast / ultrafast / full-fibre / gigabit / below-USO) |
| `mobile-by-laua.json` | LAUA code | `etl:mobile` | Ofcom **mobile** coverage % per local authority — 4G indoors (any / all four operators), 5G outdoors (any operator); UK-wide |
| `income-by-msoa.json` | MSOA code | `etl:income` | ONS model-based **net household income** (£) per MSOA + the England & Wales median — powers the income row in "Who lives here" (E&W) |
| `affordability-by-laua.json` | LAUA code | `etl:affordability` | ONS **house-price-to-earnings ratio** (median) per local authority + the E&W median — powers the affordability line in the Prices panel (E&W) |
| `amenities.json` | category → points | `etl:amenities` | everyday-amenity coordinates (supermarkets, convenience, GPs, pharmacies, parks, gyms, cafés/restaurants) across the UK, from OSM — powers the nearby-amenity counts (the station count reuses `stations.json`; bus stops intentionally excluded) |
| `stations.json` | (array) | `etl:stations` | UK rail/metro/tram/light-rail stations (name, kind, lat/lng, **osm** feature ref) from OSM — powers the nearest-station lookup + its "view on OSM" link |
| `ev-charging.json` | (array) | `etl:ev-charging` | public EV charging locations (lat/lng, operator, capacity) from OSM — powers the EV-charging panel (count + nearest within ~1 mi); NCR is decommissioned, OSM is the free national source |
| `bathing-waters.json` | (array) | `etl:bathing-water` | England's designated bathing waters (name, lat/lng, latest classification) from the Environment Agency — powers the bathing-water panel (nearest within ~10 mi; coastal/lakeside, hidden inland) |
| `cqc-locations.json` | (array under `locations`) | `etl:cqc` | active CQC-regulated health/care locations (GP, dentist, care home, hospital, home-care): id, name, category, **latest overall rating**, rating date, postcode, lat/lng — powers the nearest-rated-service-per-category lookup (~50k; England) |
| `air-quality-by-grid.json` | OS 1 km cell (`"xkm_ykm"`) | `etl:air-quality` | modelled annual-mean background **NO₂ + PM2.5** (µg/m³) per 1 km cell, from Defra PCM — powers the air-quality panel (~255k cells; GB) |
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
| `etl:gias` | `gias.json` | GIAS bulk "all establishments" CSV (`ea-edubase-api-prod.azurewebsites.net/.../edubasealldataYYYYMMDD.csv`). Open schools; phase mapped; Easting/Northing → WGS84 via `osgbToWgs84`. Keeps NumberOfPupils, Gender, TypeOfEstablishment, ReligiousCharacter, Statutory{Low,High}Age, AdmissionsPolicy. **Special / alternative (PRU) / independent** schools file under GIAS phase "Not applicable" — admitted by establishment type, phase derived from the age range, tagged `kind`; **Welsh schools excluded** (GIAS gives them phase "Not applicable" and no age range — 0.4% have one — so they can't be placed; they come from `etl:welsh-schools` instead); universities/overseas excluded. |
| `etl:welsh-schools` | `welsh-schools.json` | **Welsh Government** "Address list of schools" (ODS) at `gov.wales/address-list-schools`, via SheetJS. English sheets `Maintained`/`Independent`/`PRU`; sector→phase (Middle→All-through), keeps pupils, Welsh-medium language category, religious character; postcode-geocoded via postcodes.io. Deduped against GIAS by postcode (a few independent/special schools are in both; GIAS wins). No Ofsted/results enrichment exists for Wales — schools link to **My Local School** (`mylocalschool.gov.wales`), which carries performance + an Estyn link. |
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
| `etl:wimd` | `wimd-by-lsoa.json` | **Welsh Government** Welsh Index of Multiple Deprivation **2025** "index and domain ranks by small area" (ODS) at `gov.wales/.../2025-11/wimd-2025-index-and-domain-ranks-by-small-area.ods`, via SheetJS. Keyed by **LSOA-2021** code (1,917 LSOAs) so it joins postcodes.io `codes.lsoa`. File gives ranks only, so domain ranks → deciles via the guidance sheet's documented (non-uniform 191–193-wide) bands; build self-checks those bands reproduce the official overall decile exactly before writing. **Used 2025, not 2019, because 2019 is on 2011 LSOAs** which no longer match postcodes.io. |
| `etl:simd` | `simd-by-datazone.json` | **Scottish Government** Scottish Index of Multiple Deprivation **2020v2** "ranks" (XLSX) from `gov.scot/collections/scottish-index-of-multiple-deprivation-2020`, via SheetJS. Keyed by **2011 data zone** code (6,976 zones) → joins postcodes.io `codes.lsoa11` (NOT `codes.lsoa`, which is the 2022 data zone). 7 domains. Domain ranks → deciles via SIMD's published decile bounds `[697,1395,…,6976]` (verified vs the official rank→decile lookup, 0 mismatches); tie-ranks carry `.5`. |
| `etl:council-tax` | `council-tax-bands-by-lsoa.json` | **VOA** "Council Tax: stock of properties", table **CTSOP4.1** (the LSOA-level breakdown). Zip linked from the annual release page (`gov.uk/government/statistics/council-tax-stock-of-properties-<year>`, default 2025, snapshot 31 Mar); the ETL scrapes the asset link, shells `unzip`, keeps `geography==LSOA` rows and sums `all_properties` per band. Counts VOA-rounded to 10 (`-` = nil). Accepts a year or a local `.csv`/`.zip` arg. |
| `etl:council-tax-cost` | `council-tax-cost-by-laua.json` | **MHCLG** "Council tax levels set by local authorities in England", **Table 9** of the "Tables 1-9" **ODS** on the annual release page (`gov.uk/.../council-tax-levels-set-by-local-authorities-in-england-2026-to-2027`). Per billing authority: the area-total Band A–H £ (incl. county/police/fire/parish precepts), keyed by ONS code. The project's `xlsx` can't read this ODS (error cells) so the ETL parses `content.xml` directly. England only; ~296 authorities. |
| `etl:broadband` | `broadband-by-laua.json` | **Ofcom Connected Nations** (CN2024, OGL) "fixed coverage: UK nations" **zip** → the LAUA-level CSV (`…fixed_laua_coverage…`); the ETL shells `unzip`. Per-postcode is 121 area CSVs (~2.5M rows, too big to commit), so the LA aggregate is used; key = LAUA ONS code (postcodes.io `codes.admin_district`). |
| `etl:mobile` | `mobile-by-laua.json` | **Ofcom Connected Nations** (CN2024, OGL) "mobile coverage: UK nations" **zip** → `202409_mobile_coverage_laua_r01.csv` (same release/join as broadband, `fetch` follows the 301). Columns are `{tech}_{prem\|geo}_{in\|out}_{N}` where N = how many of the 4 MNOs cover that location; surfaces 4G-indoor (≥1 / all 4 operators) and 5G-outdoor (≥1). **Blank cells = 0** (so "≥1 operator" = 100 − the `_0` column). UK-wide. |
| `etl:amenities` | `amenities.json` | **OSM via Overpass** (one-off, at build time): national per-category queries (supermarket, convenience, doctors, pharmacy, park, fitness_centre, restaurant, cafe) with `out center;` (coords only; a single national query 504s for polygon-heavy categories like parks, so those fall back to latitude-banded queries). Moves the per-request Overpass amenity lookup to build time so `nearbyAmenities` is a committed-data read. **Bus stops excluded** (~370k, low signal); the station count reuses `stations.json`. |
| `etl:stations` | `stations.json` | **OSM via Overpass** (one-off, at build time): a UK-bbox query for `railway=station\|halt\|tram_stop`, classified rail/metro/light_rail/tram from the same tags the runtime used, deduped to one point per station (~4,300). Moves the (rate-limit-prone) Overpass call out of the request path so `nearestStations` is a committed-data read. Tries two Overpass mirrors; refuses to write a truncated (<2,000) result. |
| `etl:ev-charging` | `ev-charging.json` | **OSM via Overpass** (one-off): UK-bbox `amenity=charging_station` (nodes + ways, `out center`), keeping lat/lng + `operator` + `capacity` (~8,500 sites, ~73% operator / ~71% capacity; connector/power too sparse to keep). The official **National Chargepoint Registry was decommissioned 28 Nov 2024**, so OSM is the free national source. Mirrors `etl:stations` (two Overpass mirrors, refuses a truncated <5,000 result). |
| `etl:income` | `income-by-msoa.json` | **ONS** "Income estimates for small areas" **XLSX** (FYE2023, OGL): the "Net annual income" sheet → net household income £ per MSOA (E02/W02), keyed by MSOA code; also stores the E&W median. Parsed with SheetJS via **`XLSX.read(buffer)`** (the ESM build's `readFile` needs fs wired — use `read` like `etl:finance`). |
| `etl:affordability` | `affordability-by-laua.json` | **ONS** "Ratio of house price to workplace-based earnings" **XLSX** (OGL, `/current/` = latest): sheet **`5c`** (median ratio by LA district) → ratio per LA code (E&W), latest single year (the year columns are plain `"2025"`, with a trailing `"5-Year Average"` to skip); also stores the E&W median. |
| `etl:bathing-water` | `bathing-waters.json` | **Environment Agency** bathing-water linked-data API (free, OGL): `doc/bathing-water.json` with **`_properties=name,samplingPoint.lat,samplingPoint.long,latestComplianceAssessment.complianceClassification.name`** (the `_view=all` form 504s over the whole set). ~464 designated waters with their latest annual classification (Excellent/Good/Sufficient/Poor). |
| `etl:cqc` | `cqc-locations.json` | **CQC "care directory with filters"** (free, **no-key**, OGL) — the `HSCA_Active_Locations` **ODS** on `cqc.org.uk/about-us/transparency/using-cqc-data`. The ETL scrapes the `…_HSCA_Active_Locations.ods` link, shells `unzip content.xml`, and parses the sheet like `etl:council-tax-cost` (our `xlsx` can't read these reliably); decodes XML entities. **Not** the key-gated CQC Syndication API (no radius search; ratings only in its per-location detail endpoint). Keeps GP/dentist/care home/hospital/home-care; the overall rating + coords are already in the file; deep link `cqc.org.uk/location/{id}`. |
| `etl:air-quality` | `air-quality-by-grid.json` | **Defra PCM modelled background maps** (free, **no-key**, OGL): national 1 km CSVs `uk-air.defra.gov.uk/datastore/pcm/mapno2<yr>.csv` + `mappm25<yr>g.csv` (5 metadata rows, then `gridcode,x,y,value`; x/y = OSGB easting/northing of the cell **centre**). Merges NO₂ + PM2.5 by 1 km cell, keyed `"floor(x/1000)_floor(y/1000)"`. Covers GB (OSGB grid; NI uses the Irish grid). Accepts two local CSV paths to skip the download. |
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
    map/page.tsx          → <MapExplorer/>          (Mapbox explorer with overlay layers; NOT in the header nav - reachable at /map directly)
    sources/page.tsx      → <SourcesPage/>          (data sources, licences & disclaimers; footer-linked)
    layout.tsx (sticky header: <Logo/> + tagline, no nav links), icon.svg (favicon), globals.css
    api/
      area/route.ts            geocode + schools + crime + prices + amenities + ev-charging + transport + broadband + mobile + noise + air-quality + bathing-water + census + income + affordability → AreaReport (cached 6h, namespaced by deploy SHA)
      schools/route.ts         fetchSchoolsByIds() — full School objects by id (school compare)
      school-search/route.ts   searchSchools() autocomplete
      place-search/route.ts    searchPlaces() autocomplete (town/city/borough, postcodes.io Places)
      crime-points/route.ts    point-grid crime layer (police.uk)
      deprivation-points/route.ts  point-grid IMD layer (postcodes.io)
      flood/route.ts           EA flood-risk lookup
      planning/route.ts        fetchPlanning() — nearby planning applications for a point (PlanIt aggregator; for the area Property-checks row)
      cqc/route.ts             nearbyCqc() — nearest rated health/care services for a point (committed CQC directory; for the property report + area Property-checks row)
      planning-constraints/route.ts  fetchPlanningConstraints() — designations + listed buildings at a point (live planning.data.gov.uk; property report + area Property-checks row)
      epc/route.ts             fetchEpc() — domestic EPC bands for a postcode (MHCLG; server-side token)
      address-search/route.ts  addresses at a postcode — EPC register (fetchAddresses) MERGED with VOA council-tax dwellings (fetchVoaAddresses), so homes with no EPC still appear (best-effort)
      property/route.ts        per-property report for ONE address (EPC band + VOA band + LR sale history + flood + planning + planning constraints + nearest stations + CQC health/care)
  lib/   (one concern each)
    geocode.ts      postcode → centre + AreaFacts (IMD overall + domains); searchPlaces() (place suggestions) + geocodePoint() (place → facts via reverse-geocode)
    schools.ts      fetchSchools() / fetchSchoolsByIds() (GIAS+nurseries, URN-enriched; + Welsh register pins, nation:"Wales"; runtime fs reads), searchSchools()
    reportCard.ts   new-framework EY report-card model + gradeDisplay()/gradeRank() (prefer report card over legacy grade)
    imd.ts  imdDomainsForLsoa() (England IMD 2019)   ·  wimd.ts  wimdForLsoa() (Wales WIMD 2025, overall + 8 domains)   ·  simd.ts  simdForDatazone() (Scotland SIMD 2020v2, overall + 7 domains; joins codes.lsoa11)   ·  broadband.ts  broadbandForLaua()   ·  mobile.ts  mobileForLaua() (Ofcom 4G/5G by LAUA)   ·  income.ts  incomeForMsoa() (ONS net household income by MSOA)  ·  affordability.ts  affordabilityForLaua() (ONS house-price-to-earnings ratio by LA)
    councilTax.ts councilTaxForLsoa()  (VOA band mix for the LSOA; runtime fs read like imd.ts)
    crime.ts        fetchCrime()  ·  prices.ts  fetchPrices()/fetchAddressSales()  ·  flood.ts  fetchFlood()  ·  planning.ts  fetchPlanning() (nearby planning applications, PlanIt — runtime live fetch)  ·  planningConstraints.ts  fetchPlanningConstraints() (designations + listed buildings at a point, planning.data.gov.uk — runtime)  ·  census.ts  fetchCensus() (Census 2021 demographics by lsoa21, ONS/Nomis — runtime fetch, cached 30d)  ·  transport.ts  nearestStations() (nearest rail/metro/tram from committed stations.json) + stationsData()  ·  amenities.ts  nearbyAmenities() (counts from committed amenities.json + stations.json)  ·  evCharging.ts  nearbyEvCharging() (EV chargers near a point, committed OSM ev-charging.json)  ·  bathingWater.ts  nearestBathingWater() (nearest designated bathing water within ~10mi, committed EA bathing-waters.json)  ·  cqc.ts  nearbyCqc() (nearest rated GP/dentist/care home/hospital/home-care from committed cqc-locations.json + rating mix)  ·  airQuality.ts  airQualityForPoint() (background NO₂/PM2.5 from committed air-quality-by-grid.json, by OSGB easting/northing)
    epc.ts  fetchEpc() (postcode summary) + fetchAddresses() / fetchEpcByUprn() (band) + fetchFullCertificate() (full cert by LMK)  ·  voa.ts  fetchCouncilTaxBand() (exact band, one address) + fetchVoaAddresses() (postcode dwelling list for the picker) — both best-effort scrapes sharing voaResultsHtml()
    benchmark.ts    crime/price national-percentile helpers   ·  cache.ts  optional Upstash
    phase.ts        phase filter (PhaseFilter, matchesPhase, phaseTabs)
    schoolFilters.ts SchoolFilters model + applyFilters() (phase/gender/faith/grammar/Ofsted)
    routes.ts       Route = "area" | "property"  ·  ratings.ts / scoreColors.ts colour scales  ·  mapMarkers.ts  pin shape (phase) + colour/label (grade), shared by AreaMap/MapboxMap/legend
    distance.ts     haversine miles  ·  links.ts  DfE/Ofsted URLs  ·  sources.ts  source links (EPC/VOA/EA/LR/Ofcom/police.uk/MHCLG/Defra/OSM/PlanIt/planning.data/ONS/CQC)  ·  types.ts  all shared types
  components/
    Dashboard.tsx        search, loading/error, Map/List toggle, Report + SidePanels
    AreaMap.tsx          Leaflet map: radius ring + school pins (shape = phase, colour = grade; popup name → detail drawer)
    SchoolControls.tsx   phase chips + collapsible Filters (Ofsted/gender/faith/grammar)
    PhaseChips.tsx       the phase chip row (used inside SchoolControls)
    SchoolsPanel.tsx     league-table list: sort + shortlist (★, localStorage)
    SchoolCard.tsx       list card (pills: Ofsted, P8, GCSE%, Parent View; pupils in meta)
    SchoolDetail.tsx     the per-school drawer: Details, Ofsted, GCSE, A-level, KS2, Destinations,
                         Pupil composition, Workforce, Finances, Parent View (full breakdown)
    DeprivationPanel · DemographicsPanel · CrimePanel · PricePanel · AmenitiesPanel · TransportPanel · EvChargingPanel · BroadbandPanel · MobilePanel · NoisePanel · AirQualityPanel · BathingWaterPanel · RankingsPanel  (area panels)
    PropertyExplorer  (the "Check a property" route: postcode → pick exact address → per-property report; EPC A–G scale, council-tax + neighbourhood bar, tenure+type, sold-price growth, nearby planning applications, planning constraints (designations + listed buildings), nearby health & care (CQC ratings), location map)
    PropertyMap  (lean single-marker Leaflet map on the property report; postcode centroid, CARTO tiles)
    PropertyChecks (postcode-area checks - flood/prices/tenure/EPC/council-tax with band bars + nearby planning applications + health & care (CQC); in the area route's Area panels) · RouteSelector · RouteHeader (shared title + two-tile chooser, on both the area & property landings so navigation matches) · PostcodeSearch
    MapExplorer · MapboxMap · LayerControl   (the /map page; LayerControl carries the crime-category filter)
    Compare (Areas|Schools tabs) · AreasCompare · CompareTable · SchoolsCompare · SchoolCompareTable · SchoolSlotInput  (/compare)
    Card · Pill · RatingBadge · ParentViewBadge · Progress8Badge · SourceLink · Logo (official hexagon mark + "locale" wordmark; currentColor so it reads on the dark nav; header + favicon)   (primitives)
```

`AreaMap` is **keyed on `centre + radius + layout + filter signature`** so the (mount-only) Leaflet
map remounts and re-fits when any of those change.

---

## 8. Features (dashboard)

- **Search:** postcode, **school name, or place** (town / city / borough — autocomplete; places via
  postcodes.io Places, so a postcode isn't needed); adjustable **radius** (½–5 mi).
- **Focus filter** on the area report - **Schools · Area · Schools + area** - toggles which side panels
  show; the **Property checks** panel (flood, sold prices, tenure, EPC, council-tax band — each with
  band distribution bars — plus nearby planning applications, planning constraints and health & care (CQC) ratings) sits in
  the **Area** set.
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
- **Area panels:** **Area rankings** (national-percentile summary), **Who lives here** (Census 2021
  demographics — age structure + median, self-reported health, tenure mix, car/van availability, work,
  education, household composition, plus **net household income** (ONS small-area estimates, MSOA, vs the
  E&W median); England &
  Wales), **Deprivation** (England **IMD 2019** 7-domain; Wales **WIMD 2025** overall + 8-domain; Scotland **SIMD 2020v2** overall + 7-domain), Crime (vs national percentile), **Amenities** (committed OSM dataset — supermarkets,
  convenience, GPs, pharmacies, parks, gyms, dining, + the station count), **Transport** (the nearest
  rail/metro/tram station, named — committed OSM dataset), **EV charging** (public chargepoints near the
  point — count + nearest with operator/capacity, committed OSM dataset), **Broadband** (Ofcom coverage), **Mobile
  coverage** (Ofcom Connected Nations 4G/5G by local authority), **Noise**
  (Defra road & rail, England — Lden/Lnight
  at the point), **Air quality** (Defra PCM modelled background NO₂/PM2.5 on a 1 km grid, GB — annual mean
  + Low/Moderate/Elevated/High band vs the WHO guideline; pairs with Noise), **Bathing water** (Environment
  Agency — the nearest designated bathing water + its latest annual classification; coastal/lakeside only,
  hidden inland), Property prices (incl. an ONS **house-price-to-earnings affordability ratio** for the
  LA vs the E&W median), Property checks (EA flood + tenure + EPC energy ratings + **council-tax
  band** — the VOA band mix for the surrounding neighbourhood/LSOA (not a single address), now with MHCLG's all-in ≈£/yr for the typical band — and **nearby planning applications** (PlanIt — the most-recent applications within ~0.5 km, each linking to the council's own record), **planning constraints** (conservation area / listed buildings / article-4 / green belt etc. at the point, planning.data.gov.uk), and **health & care (CQC)** — the nearest *rated* GP, dentist, care home, hospital and home-care service within ~3 mi plus the local rating mix, from CQC's OGL care directory).
- **Check a property (per-address report):** the "Check a property" route asks for a **postcode**, lists the
  **specific addresses** at it (EPC register), and on pick returns **that property's** report - EPC band,
  **council-tax band + the actual £/yr** (VOA band + MHCLG all-in cost, with the neighbourhood mix bar), its **sold-price history + tenure** (HM
  Land Registry), **flood**, **nearby planning applications** (PlanIt, linking to the council record), **planning constraints** (designations whose boundary contains the point + listed buildings within ~150 m, planning.data.gov.uk), **nearby health & care** (CQC — nearest rated GP/dentist/care home/hospital/home-care + the local rating mix), and the **nearest train/tram/metro stations** (OpenStreetMap, named + distance) - via `PropertyExplorer` + `/api/property`. An opt-in **"See the
  neighbourhood"** toggle (collapsed by default) fetches the area report for the postcode and shows the
  area panels (schools, crime, deprivation, amenities, broadband, noise, prices) inline.
- **Compare areas *or* schools** side by side (`/compare`, name typeahead; "Compare shortlisted" from
  the list). **`/map`** explorer: overlay layers + a **crime-category filter** and per-domain IMD recolour.
- **Every panel links to its source** (a clickable "↗" in the footer): Ofsted/DfE (schools), HM Land
  Registry (prices), VOA (council tax), Environment Agency (flood), Ofcom (broadband), police.uk
  (crime), MHCLG (IMD), Defra (noise), OpenStreetMap (amenities/stations), PlanIt (planning applications), planning.data.gov.uk (planning constraints), CQC (health & care) — built by `lib/sources.ts`,
  rendered via the `SourceLink` primitive. The per-property report **deep-links per item** where a key
  exists: each EPC band → its certificate (LMK key), each nearest station → its OSM feature, each planning
  application → the council's own record; council
  tax / flood link to the official checkers. Form-only services (VOA, EA) link to their start page.
- **Licences & disclaimers:** a footer-linked **`/sources`** page lists every dataset, its open-data
  licence and the required attributions (OGL / ODbL / HM Land Registry / EPB) — and flags **PlanIt**
  (planning) as a **third-party aggregator** rather than open data, with the council record noted as
  authoritative — plus the site
  disclaimers (information-only, not advice, verify-with-source, no-affiliation, liability limit). The
  global footer carries the OGL + "© OpenStreetMap contributors (ODbL)" attribution and the headline
  disclaimer; **`NOTICE.md`** records the third-party data licences and marks the OSM-derived committed
  datasets (`stations.json`, `amenities.json`) as ODbL.

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
- **Wales deprivation = WIMD, and the LSOA vintage matters.** postcodes.io now returns **2021** LSOA
  codes in `codes.lsoa` (= `codes.lsoa21`) for *both* nations. So Welsh deprivation uses **WIMD 2025**
  (`wimd.ts` / `wimd-by-lsoa.json`), which is published on **2021 LSOAs (1,917)** and joins cleanly —
  *not* WIMD 2019, which is on 2011 LSOAs (1,909, `W01000001`–`W01001958`) that no longer match (e.g.
  central-Cardiff `CF10 1EP` → `W01002019`, a 2021 code absent from the 2019 file). **Do not trust
  postcodes.io's own `index_of_multiple_deprivation` for Wales** — it's the stale 2019 *rank*
  (returns 999 for an LSOA whose WIMD-2025 rank is 1062), so the overall figure comes from our
  committed dataset, not postcodes.io. *Latent England caveat (out of scope):* the same 2011→2021
  migration means `etl:imd`'s 2011-keyed file silently misses England's split/merged 2021 LSOAs (e.g.
  `M1 1AE` → `E01034129`, not in IMD-2019) — the panel just doesn't render there. Fixing needs an IMD
  refresh on 2021 LSOAs or a 2021→2011 best-fit bridge.
- **Scotland deprivation = SIMD, joined on `codes.lsoa11` (NOT `codes.lsoa`).** SIMD 2020v2
  (`simd.ts` / `simd-by-datazone.json`) is on **2011 data zones** (6,976, `S01…`). postcodes.io returns
  the Scottish data zone in `codes.lsoa` (= the **2022** data zone, `lsoa21`) *and* in `codes.lsoa11`
  (the **2011** one) — so SIMD must join `codes.lsoa11` (e.g. Edinburgh `EH1 1RE` → 2011 `S01008678`
  rank 3815, vs 2022 `S01014714` which isn't in SIMD). Unlike Wales, postcodes.io's own
  `index_of_multiple_deprivation` for Scotland **is** the live SIMD rank (matches the dataset), but we
  use the committed file for the authoritative rank + the 7 domains + decile. SIMD tie-ranks carry a
  `.5`; the decile bound test uses `<=` so they map fine.
- **Welsh schools can't come from GIAS — use the Welsh register.** GIAS *contains* ~1,570 open Welsh
  schools but gives them phase "Not applicable", a single useless type ("Welsh establishment"), and a
  statutory age range only 0.4% of the time — so they can't be placed/classified and `build-gias.mjs`
  drops them (`group === "Welsh schools"`). The phase/sector comes from the **Welsh Government "Address
  list of schools"** instead (`etl:welsh-schools`): English sheets `Maintained`/`Independent`/`PRU`,
  with `Sector` → phase and a Welsh-medium `language` field. There is **no Ofsted/DfE/Estyn grade** for
  the badge model: Estyn (the Welsh inspectorate) publishes narrative reports with no single judgement,
  and Welsh results aren't in a bulk league table. So Welsh `School`s carry `nation:"Wales"`,
  `ofsted:"Not rated"`, and the UI (SchoolCard/SchoolDetail/map pin) shows a neutral "Wales" state +
  a **My Local School** link (`mylocalschool.gov.wales/School/{number}`, which has performance,
  attendance and an Estyn link) instead of an Ofsted grade. Pulling Estyn grades is a future step.
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
  (`fetchAddresses`; covers only certificated dwellings). EPC's **full certificate** (floor area, rooms,
  heating, fabric, current/potential rating) **IS available with the same Search-API bearer token** - the
  endpoint is a **query param** `GET /api/certificate?certificate_number={LMK}`, NOT the old path-style
  `/api/domestic/certificate/{lmk}` (which 404s; that wrong path made us wrongly conclude a separate
  API/token was needed). `fetchFullCertificate(lmk)` returns it and `/api/property` renders an **Energy
  certificate** block. (Improvement *recommendations* sit at a separate endpoint, still TBC.) The exact
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
- **Planning applications: no official national API — PlanIt is the practical source.** UK planning
  applications are published per local authority with **no single government API**; `planning.data.gov.uk`
  serves planning **constraints** (conservation areas, listed buildings, article-4) — *not* application
  records — and the GLA Datahub is London-only. **PlanIt** (`planit.org.uk/api/applics/json`) aggregates
  the council registers into one keyless JSON API (send a real `User-Agent`). Gotchas: geo is
  `?lat=&lng=&krad=` where **`krad` is the radius in km** (or `?bbox=w,s,e,n`); **the default order is
  NOT recency — pass `sort=-start_date`** for newest-first; the response `total` is the **all-time** count
  for the area, not the page; each record's **`url` is a deep link to the council's own register**
  (authoritative — prefer it), `link` (the PlanIt page) is the fallback, and **`uid`** is the council
  reference (the top-level `reference` is often null). `fetchPlanning()` (`src/lib/planning.ts`) is a
  runtime live fetch — cached 6 h, fails gracefully to null, no ETL / no committed data (like flood) —
  feeding the per-property "Planning applications nearby" card and the area Property-checks row (via
  `/api/planning`). Attribution: it is a **third-party aggregator, not OGL / Crown-copyright open data** —
  flagged as such on `/sources` + `NOTICE.md`, with each item linking to the authoritative council record.
- **Census 2021 demographics are free via Nomis, and the geography join is clean.** "Who lives here"
  (age, tenure, economic activity, qualifications, household composition) comes from the ONS Census 2021
  "TS" tables on the **Nomis API** (`nomisweb.co.uk/api/v01/dataset/{id}.data.json?geography={gss}&measures=20100,20301`,
  no key; 20100 = count, 20301 = percent). The vintage trap is handled for free: **postcodes.io returns
  `codes.lsoa21` natively** (and `codes.lsoa` now also returns the **2021** code — see the WIMD note
  above re: the IMD vintage mismatch this causes), so a postcode maps straight onto
  the 2021 census LSOA — no 2011→2021 lookup. Two type gotchas, each cost a debug cycle: (1)
  `obs[].measures.value` is a **number**, not a string — compare numerically (`=== 20301`, not `"20301"`);
  (2) `obs[].obs_value.value` is a **mix of strings and numbers** (Nomis serialises some smaller values as
  strings), so coerce with `Number()` — a strict `typeof === "number"` silently drops those bands and
  wrecks the median (Manchester centre read 15 instead of 29). `fetchCensus()`
  (`src/lib/census.ts`) is a runtime fetch (cached 30 d; Census 2021 is static), partial-tolerant
  (`Promise.allSettled` per table), **England & Wales only** (E01/W01 LSOAs; Scotland = NRS, NI = NISRA are
  separate). Could move to a committed ETL later (the amenities/stations trajectory) if per-report Nomis
  calls ever matter. Table ids: TS007A age `NM_2020_1`, TS054 tenure `NM_2072_1`, TS066 economic activity
  `NM_2083_1`, TS067 qualifications `NM_2084_1`, TS003 household composition `NM_2023_1`, TS045 car/van
  availability `NM_2063_1`, TS037 general health `NM_2055_1`.
- **CQC ratings: the API is key-gated AND radius-less — use the free OGL bulk file instead.** The CQC
  Syndication API (`api.service.cqc.org.uk/public/v1`) needs a (free, but interactive-signup)
  subscription key — 401 *"missing subscription key"* without `Ocp-Apim-Subscription-Key` — **and**
  `/locations` has **no lat/long radius search** (only admin geography: region / local authority), with
  the overall rating + coordinates living **only in the per-location `/locations/{id}` detail
  endpoint**, so a runtime radius query would be hundreds of detail calls per report. Not viable.
  Instead `etl:cqc` ships CQC's free, **no-key, OGL "care directory with filters"** — the
  `HSCA_Active_Locations` **ODS** on `cqc.org.uk/about-us/transparency/using-cqc-data` (direct-link
  pattern `…/sites/default/files/<YYYY-MM>/<DD_Month_YYYY>_HSCA_Active_Locations.ods`, refreshed
  ~weekly). Its one data sheet already carries **Latest Overall Rating + Publication Date + Postcode +
  Latitude + Longitude + Location ID** (~56k active locations, **99% with coords**) → committed
  `cqc-locations.json`, read by `nearbyCqc()` (`src/lib/cqc.ts`) as a radius lookup like
  amenities/stations (no key anywhere; nearest *rated* of each category within ~3 mi, falls back to
  nearest unrated). Parse gotchas: the **static file host serves plain `curl` fine** — only the **API
  portal** WAFs; parse the ODS via `unzip content.xml` + regex like `etl:council-tax-cost` (our `xlsx`
  can't read these reliably); and **decode XML entities** (`&amp;`→`&`) for service names. CQC shares
  Ofsted's Outstanding→Inadequate scale, so `normaliseRating` / `RatingBadge` are reused; the profile
  deep link is deterministic (`cqc.org.uk/location/{id}`). Surfaced on the property report (`CqcCard`)
  + the area Property-checks row via `/api/cqc`. **England only** (CQC regulates England; Wales = CIW,
  Scotland = Care Inspectorate, NI = RQIA are separate registers).
- **Air quality: free Defra PCM 1 km maps — but watch the NI Irish-grid alias.** Modelled annual-mean
  **background** NO₂ + PM2.5 come from Defra's Pollution Climate Mapping (PCM) maps — free, **no key**,
  OGL — as one national CSV per pollutant per year: `uk-air.defra.gov.uk/datastore/pcm/mapno2<yr>.csv`
  and `mappm25<yr>g.csv` (note the trailing **`g`** on PM2.5). Layout: 5 metadata rows
  (pollutant/year/metric/unit/blank), then `gridcode,x,y,<col>`; **x,y are the OSGB easting/northing of
  the 1 km cell CENTRE** (…500), and the same `gridcode` aligns both files. `etl:air-quality` merges
  them into `air-quality-by-grid.json` keyed `"floor(x/1000)_floor(y/1000)"`; `airQualityForPoint()`
  floors the point's easting/northing the same way. The join key is the postcode's OSGB
  easting/northing, now surfaced by `geocode.ts` from postcodes.io (`eastings`/`northings`). **The trap
  (cost a verify cycle):** postcodes.io returns the **Irish Grid** easting/northing for **Northern
  Ireland** postcodes, which look like valid OSGB numbers and *alias onto an unrelated GB cell* — Belfast
  read a rural N-England reading instead of null. PCM is OSGB/**GB-only**, so `/api/area` gates the
  lookup on `country ∈ {England, Scotland, Wales}` (not merely "has coordinates"); NI → null → the panel
  hides. Committed-data read like amenities/noise; pairs with the noise panel. Bands anchor on the
  health references (NO₂: WHO 10 / UK legal limit 40; PM2.5: WHO 5 / England 2040 target 10).
- **Mobile coverage reuses the broadband pipeline — but blank means zero.** Ofcom Connected Nations
  publishes **mobile** coverage in the same release as fixed broadband, so `etl:mobile` mirrors
  `etl:broadband`: download the "mobile coverage: UK nations" zip, `unzip`, read
  `202409_mobile_coverage_laua_r01.csv`, key by **LAUA** (`codes.admin_district`), runtime
  `mobileForLaua()` like `broadbandForLaua()`. UK-wide (incl. NI — Ofcom covers all four nations, unlike
  the GB-only Defra air-quality grid). Two gotchas: (1) the zip URL **301-redirects** to a `?v=` URL —
  harmless, Node `fetch` follows it. (2) The columns are `{tech}_{prem|geo}_{in|out}_{N}` where **N is
  the number of the four MNOs** (EE/O2/Three/Vodafone) covering that location (`_0`=none … `_4`=all
  four), and **a blank cell means 0, not missing** — so in a dense city `4G_prem_in_0` is blank (0% have
  no coverage) and "≥1 operator" = `100 − _0` = 100%. Treat blanks as 0 *within* a distribution, but
  return null when the whole `_0…_4` set is blank (real no-data). We surface 4G-indoor (≥1 op / all 4)
  and 5G-outdoor (≥1 op; 5G indoor isn't reported). Bands/panel mirror Broadband.
- **Planning constraints: planning.data.gov.uk is a live point-query, not a dataset.** MHCLG's national
  platform (OGL v3, **no key**) is distinct from the planning *applications* (PlanIt) — this is the
  *designations*. `fetchPlanningConstraints()` (`src/lib/planningConstraints.ts`) makes two live
  `entity.json` calls (cached 7 d): (1) **area designations** that contain the point —
  `?dataset=conservation-area&dataset=article-4-direction-area&…&longitude=&latitude=&geometry_relation=intersects`
  (repeat `dataset=` to query many at once; add `field=` to drop the huge `geometry` from the response);
  (2) **listed buildings** near the point. Key gotcha: listed buildings are **point features**, so a
  postcode-centroid `intersects` almost never hits one — instead pass a small **bbox `POLYGON`** as
  `geometry` (~150 m) and rank by distance from the returned `point` field (so it's "nearby / could be
  listed", not "this building is listed"; the report says as much). Listed buildings carry
  `listed-building-grade` (I / II* / II) and a `documentation-url` deep-link to Historic England. Surfaced
  on the property report (`PlanningConstraintsCard`) + the area Property-checks row via
  `/api/planning-constraints`. Datasets are filtered to typology `geography`; we deliberately skip
  `flood-risk-zone` (the EA flood panel already covers flooding).
- **EV charging: the National Chargepoint Registry is dead — use OSM.** The official NCR
  (`chargepoints.dft.gov.uk`) was **decommissioned 28 Nov 2024** (host no longer resolves); the
  replacement is fragmented per-operator open-data feeds with no single national endpoint. So
  `etl:ev-charging` takes `amenity=charging_station` from **OpenStreetMap** via Overpass and commits it
  like `etl:stations` (runtime `nearbyEvCharging` is a committed-data radius read). OSM coverage of
  location + `operator` (~73%) + `capacity` (~71%) is good; **connector type and power are too sparsely
  tagged** (<15%) to surface, so we keep just position/operator/capacity and the panel is "where + how
  many," not "rapid vs slow". Attribution is **ODbL** (like amenities/stations) — recorded in
  `NOTICE.md`.
- **Bathing water: use `_properties`, not `_view=all`.** The EA bathing-water **linked-data** API
  (`environment.data.gov.uk/doc/bathing-water.json`, free OGL) is verbose JSON-LD. `?_view=all` over the
  whole set **504s**; instead select just the nested fields with
  **`_properties=name,samplingPoint.lat,samplingPoint.long,latestComplianceAssessment.complianceClassification.name`**
  (ELDA dot-path properties) — one request returns all ~464 waters slim. Literals are wrapped as
  `{_value,…}` (unwrap). `etl:bathing-water` commits them; `nearestBathingWater()` returns the nearest
  only within ~10 mi (so the panel shows for coastal/lakeside areas and hides inland), skipping `Closed`
  ones. Classifications are the annual revised-Bathing-Water-Directive grades (Excellent/Good/Sufficient/Poor).

For agents working in this repo: the Bash cwd can drift back to a sibling project, so run ETLs /
`tsc` from the repo root (prefix `cd`) or by absolute path; verify deploys with `curl` (the
in-tool browser preview is sandboxed and can't load this app).

> **⚠️ Known setup issue — SETTINGS NOW DECOUPLED (Jun 2026).** These sessions have historically run
> from an *unrelated* sibling workspace (the `Whatson` project), with `area-intel` only an additional
> working directory, which tangled the two. **Now fixed for permissions:** `area-intel` has its **own**
> `.claude/settings.local.json` (gitignored), and the ~45 area-intel permission entries that had piled
> up in **`Whatson/.claude/settings.local.json`** were pruned out — the two projects no longer share a
> permission list. **Remaining (for full separation):** launch Claude Code with **`~/Desktop/area-intel`
> as the workspace root** for area-intel work, not from Whatson. That also clears the two leftover
> leaks: (1) the built-in **Preview** integration binds to whatever root you launch from, so from
> Whatson it can't load this app (harmless nag — ignore it until you switch); (2) this project's
> **auto-memory** still lives under Whatson's project path (`~/.claude/projects/-Users-…-Whatson/memory/`)
> and only binds to an area-intel path once you run from area-intel's own root. Until then: verify via
> `tsc` / `build` / `curl` + the live URL.

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
strategic noise mapping, Round 4), a **council-tax band mix** (VOA stock-of-properties, by LSOA), **nearest-station transport** (a committed UK rail/metro/tram dataset from OSM via `etl:stations`, named — on the property *and* area reports), **EV charging** (public chargepoints near a point — count +
nearest with operator/capacity, committed OSM dataset via `etl:ev-charging`, since the National
Chargepoint Registry was decommissioned), **nearby planning applications** (PlanIt — most-recent applications
near a point, on the property + area reports), **planning constraints** (conservation areas, listed
buildings, article-4 directions, green belt, AONB, national parks, scheduled monuments, WHS & TPO zones
at a point — a live `planning.data.gov.uk` query, on the property + area reports), **CQC health & care
ratings** (the nearest *rated* GP,
dentist, care home, hospital and home-care service within ~3 miles plus the local rating mix, from
CQC's Open Government Licence "care directory with filters" — a committed dataset via `etl:cqc`, on the
property + area reports), **air quality** (Defra PCM modelled background NO₂/PM2.5 on a 1 km grid, GB —
annual mean + WHO-guideline band, an area panel pairing with noise, via `etl:air-quality`), **bathing water** (nearest EA designated
bathing water + its latest classification within ~10 mi, coastal, via `etl:bathing-water`), **mobile coverage** (Ofcom Connected Nations
4G/5G % of premises by local authority, UK-wide, via `etl:mobile` — reuses the broadband pipeline),
**Census 2021 demographics** ("Who lives here" — age,
tenure, work, education, household mix, **car ownership, self-reported health & net household income**
(ONS Nomis + small-area income, England & Wales), and a **complete school
register** — special, alternative/PRU &
independent schools (filed by GIAS under phase "Not applicable") are now admitted instead of silently
dropped (+~4,100 schools), tagged by `kind`, filterable by type, and shown honestly (independent =
ISI-inspected, no Ofsted grade).

**Remaining (free data): the original Tier-1 queue is cleared; a fresh sweep found more England layers.**
Every originally-queued free dataset has shipped; a "what other England free data exists" sweep then
added **EV charging**, a **Census expansion** (car/van availability + self-reported health), **EA
bathing-water** quality, **ONS small-area income** and the **ONS housing-affordability ratio** (the one
worthwhile dataset earlier dropped, now in — so the genuinely-worthwhile free set is complete). Remaining
candidates, both judged **not worth building**: **bus stops** (NaPTAN/OSM — ~370k, low signal: there's almost always one nearby, and routed
frequency needs the harder BODS feeds) and **DfT journey-time/connectivity** stats (genuinely useful
"mins to GP/school/shops" but last published **~2019** — too stale to ship). **OHID Fingertips**
local-health indicators were also dropped: its area-type API is fiddly (500s on reasonable LA queries)
and LA-level life expectancy *overlaps* the LSOA self-reported health just added via census, at coarser
granularity. (**Census 2021 demographics** (+ car/van, health & income), **CQC health/care ratings**,
**air quality**, **mobile coverage**, **planning constraints**, **EV charging**, **bathing water**,
**small-area income** and the **housing-affordability ratio** shipped this round; the `/api/area` cache is
now namespaced by deploy SHA so new panels appear immediately instead of waiting out the 6h TTL. Bathing
water is the nearest EA designated water within ~10 mi (coastal, hidden
inland; see §9).
EV charging is OSM `amenity=charging_station` committed like stations — the official National Chargepoint
Registry was decommissioned 28 Nov 2024 (see §9). Planning
constraints is a live `planning.data.gov.uk` (MHCLG, OGL) spatial query — a multi-dataset point-intersect
for area designations plus a small-box query for nearby listed buildings — *not* a committed dataset, and
distinct from the planning *applications* (PlanIt). CQC was *not* built on the key-gated CQC Syndication API — that API has no radius search and
exposes ratings only in its per-location *detail* endpoint (hundreds of calls per report), so a runtime
radius query isn't viable. Instead `etl:cqc` ships CQC's free, no-key, OGL bulk "care directory with
filters" as committed JSON: the `HSCA_Active_Locations` sheet already carries the overall rating, rating
date, postcode **and** coordinates in one file, so it mirrors the schools/stations committed-dataset
pattern. Air quality is Defra's PCM 1 km background maps as committed JSON, joined by the postcode's
OSGB easting/northing — GB-only, gated to skip NI, whose postcodes.io coords are Irish-grid and would
otherwise alias onto a GB cell (see §9). The last Tier-1 item, **Defra noise**, is a live
`GetFeatureInfo` WMS point-query — no ETL/committed data, like crime/prices/amenities.)

**Gated / not cleanly free (need restricted or non-bulk data — §9):** **catchment areas**,
**feeder schools** and **named destination schools** (restricted NPD pupil-flow microdata);
**per-school subjects** (DfE subject data is national-only, not bulk-published per school);
**11+ oversubscription** (published LA-by-LA, messy); **door-to-door commute times** (the nearest
*station* is shipped free via OSM, but routed journey times need a paid routing/journey-planner API).

**Follow-up — non-England nations.** Each needs its **own register, inspectorate and
performance/deprivation data**, and there is **no Ofsted-style single grade** outside England, so none
slot into the existing GIAS/Ofsted/DfE pipeline:

- **Wales** — **effectively complete** for free data. Deprivation (WIMD 2025) and the **schools
  register** are **shipped** (see §5/6/9): Welsh schools appear on the map/list/search with phase,
  pupils and Welsh-medium, from the Welsh-Gov address list (`etl:welsh-schools`), linking to My Local
  School. **Estyn was spiked and evaluated out** — grades were abolished in Sept 2022, there's no bulk
  dataset, and the only structured outcome (special measures / significant improvement) has no published
  *named* list, so no rating-badge signal is achievable; the per-school My Local School link already
  carries the live Estyn report. School *quality* parity with England isn't possible.
- **Scotland** — **deprivation (SIMD 2020v2) now shipped** (see §5/6/9; joins `codes.lsoa11`).
  Remaining: schools are *not in GIAS at all* (no Scotland group; 0 Scottish schools in the file), so
  would need the **Scottish Government** school register, **Education Scotland** inspections
  (quality-indicator framework, not graded), **SQA/Insight** results. Note police.uk also has no Police
  Scotland data, so the crime layer is England/Wales/NI only.
- *(Northern Ireland is the same shape — not in GIAS; would need the **DENI** register + **ETI**
  inspections + DENI results + **NIMDM**.)*

---

## 12. About `pipelines/` and `supabase/`

Those folders describe an **alternative Python + Postgres/PostGIS** ingestion approach that is **not
the live data path.** The running app uses the **Node ETLs + committed JSON** documented above (no
database). Treat `pipelines/` as exploratory/superseded unless a deliberate decision is made to move
spatial data into Postgres.
