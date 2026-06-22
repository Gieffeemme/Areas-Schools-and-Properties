# AreaIQ data pipelines

> **⚠️ Status: NOT the live data path.** Production uses **Node ETLs (`scripts/etl/*.mjs`) →
> committed JSON in `src/data/`**, with **no database** — see
> [`../DOCUMENTATION.md`](../DOCUMENTATION.md). This Python + Postgres/PostGIS pipeline is an
> earlier/alternative ingestion approach, kept for reference only; it does not power the app.

Python ETL that loads the free/open UK datasets into Supabase (Postgres + PostGIS).
The schema lives in [`../supabase/migrations/`](../supabase/migrations/).

## Setup

1. A Postgres + **PostGIS** database — either a Supabase project, or local:
   ```bash
   docker run -d --name areaiq-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=areaiq \
     -p 55432:5432 postgis/postgis:16-3.4
   ```
2. Apply the schema:
   ```bash
   supabase db push                       # Supabase CLI
   # or
   docker exec -i areaiq-pg psql -U postgres -d areaiq \
     < supabase/migrations/20260620120000_init.sql
   ```
3. Install deps and point at the DB:
   ```bash
   pip install -r pipelines/requirements.txt
   export DATABASE_URL='postgresql://postgres:postgres@localhost:55432/areaiq'
   ```

## Run

```bash
python -m pipelines.run --list
python -m pipelines.run gias_schools                     # all schools + overall Ofsted
python -m pipelines.run land_registry --postcode "SW11 6QT"
python -m pipelines.run land_registry --csv pp-2024.csv  # bulk Price Paid CSV
python -m pipelines.run imd --csv <IMD file.csv>
N=200 python -m pipelines.run crime_benchmark
```

## Status

| source | table(s) | state |
|--------|----------|-------|
| `gias_schools` | schools, school_ofsted (overall grade) | **implemented** |
| `land_registry` | price_paid | **implemented** (postcode + bulk CSV) |
| `imd` | imd | **implemented** (pass `--csv`) |
| `crime_benchmark` | benchmark_distributions | **implemented** |
| `ofsted_mi` | school_ofsted (sub-grades) | scaffold |
| `dfe_results` | school_ks2 / ks4 / ks5 | scaffold |
| `destinations` | school_destinations | scaffold |
| `parentview` | school_parentview | scaffold |
| `epc` | epc | scaffold (needs `EPC_API_KEY`) |
| `flood` | flood_risk | scaffold |
| `amenities` | amenities | scaffold |
| `broadband` | (follow-up table) | scaffold |

Scaffold modules raise `NotImplementedError` with the exact source URL, target table, and
join key — each is a self-contained fill-in.

## Adding a source

Create `pipelines/sources/<name>.py` exposing `run(conn, args) -> int` (rows loaded), add it to
`SOURCES` in `pipelines/run.py`. Use `pipelines.db.upsert` and the `pipelines.common` helpers.
Point geometry is generated from `lat`/`lng` in SQL, so pipelines only set those.

## Scheduling (cron, per the brief)

```cron
0 3 1 * *  cd /path/to/area-intel && DATABASE_URL=... python -m pipelines.run gias_schools
0 4 2 * *  cd /path/to/area-intel && DATABASE_URL=... python -m pipelines.run land_registry
```
