# ETL — Ofsted ratings

`build-schools.mjs` builds `src/data/ofsted-by-urn.json` from the official DfE **Get
Information About Schools (GIAS)** all-establishments CSV.

```json
{ "100000": { "rating": "Outstanding", "date": "2018-05-16", "name": "City of London School" } }
```

The app joins these onto live OpenStreetMap school pins by **URN** (OSM tag `ref:edubase`).
Until this file is populated, the UI shows ratings as "not loaded" rather than guessing.

## Run

```bash
npm run etl:schools                                   # download today's GIAS CSV from gov.uk
GIAS_CSV_URL="https://…/edubasealldataYYYYMMDD.csv" npm run etl:schools
node scripts/etl/build-schools.mjs ~/Downloads/edubasealldata.csv   # use a local file
```

## If the download fails

The gov.uk GIAS endpoint is date-stamped and occasionally returns `5xx`. When that happens,
download **"Establishment fields CSV (all establishments)"** by hand from
<https://get-information-schools.service.gov.uk/Downloads> and pass the path as an argument.

## Next steps for richer school data

- KS2 / GCSE / A-level performance: DfE "compare school performance" annual CSVs (join by URN).
- Improve OSM↔GIAS coverage for schools that lack `ref:edubase` (fuzzy match on name + postcode).
- Distinguish independent vs state, age range, and admissions from GIAS columns.
