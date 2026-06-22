# ETL scripts

Each script builds one committed JSON file in `src/data/` from a free/official UK source. They are
self-contained Node scripts — run via `npm run etl:<name>`. There is **no database**; the app reads
these JSON files directly and joins them by **URN** (schools) or **LSOA code** (deprivation).

Full catalogue with exact source URLs, column codes, and how the data is used:
**[`../../DOCUMENTATION.md`](../../DOCUMENTATION.md) §5–§6.**

| Command | Output | What |
|---------|--------|------|
| `npm run etl:gias` | `gias.json` | school **register/pins** + metadata (pupils, gender, type, faith, age, admissions) |
| `npm run etl:nurseries` | `nurseries.json` | nursery pins from the Ofsted Early Years register |
| `npm run etl:schools` | `ofsted-by-urn.json` | **Ofsted ratings** + sub-grades (⚠️ *not* the register — that's `etl:gias`) |
| `npm run etl:report-cards -- --discover` | `report-cards-by-urn.json` | new Ofsted **EY report cards** (Nov 2025+ 5-band scale) — *scraped from live pages*, absent from bulk MI; wired into the app (overrides the stale nursery grade) |
| `npm run etl:ks4` | `ks4-by-urn.json` | GCSE: Progress 8, Attainment 8, % grade 5+/4+ Eng & Maths, EBacc |
| `npm run etl:ks5` | `ks5-by-urn.json` | A-level: points/entry, grade, AAB+, cohort |
| `npm run etl:ks2` | `ks2-by-urn.json` | KS2: RWM expected/higher, reading/writing/maths progress |
| `npm run etl:census` | `census-by-urn.json` | pupil characteristics: FSM, EAL, SEN |
| `npm run etl:destinations` | `destinations-by-urn.json` | KS4 + KS5 sustained destinations |
| `npm run etl:parentview` | `parentview-by-urn.json` | full Ofsted Parent View survey |
| `npm run etl:workforce` | `workforce-by-urn.json` | pupil:teacher ratio, teacher FTE (EES) |
| `npm run etl:finance` | `finance-by-urn.json` | spend/pupil, revenue reserve, in-year balance (FBIT) |
| `npm run etl:imd` | `imd-domains-by-lsoa.json` | IMD 2019 decile per domain, by LSOA (MHCLG) |
| `npm run etl:benchmarks` | `benchmarks.json` | sampled national crime & price distributions |

## Conventions & gotchas

- **gov.uk / DfE / Ofsted / EES / FBIT WAF-block plain `curl` (403).** The scripts fetch with a
  **browser `User-Agent`** via node `fetch`. A `HEAD`/`curl -I` request 403s even with a UA — use GET.
- Most performance scripts accept a **year** or a **local file** argument, e.g.
  `node scripts/etl/build-ks4.mjs 2021-2022` or `node scripts/etl/build-ks4.mjs ./england_ks4final.csv`.
- **`etl:schools` builds Ofsted ratings, `etl:gias` builds the register.** Don't confuse them.
- **`etl:report-cards` is scraped, not bulk.** From Nov 2025 Ofsted grades early years on a new
  5-band "report card" (Exceptional → Urgent improvement) that the childcare MI CSV does **not** yet
  carry, so a re-inspected setting otherwise shows a stale old grade (e.g. URN 2821756 reads
  Inadequate in the MI but is **Expected standard** live). This ETL recovers the current grade from
  the live provider pages (`reports.ofsted.gov.uk/provider/16/{urn}`). Run `npm run etl:report-cards
  -- --discover`: it walks the date-desc childcare search (new-framework reports cluster at the front)
  and stops at the boundary, touching only the new-framework nurseries, not all ~23k. The output is
  read at runtime by `src/lib/schools.ts` and overrides the stale nursery grade. Re-run periodically
  as Ofsted publishes more.
- **Three DfE platforms:** KS2/KS4/KS5/CENSUS/destinations → *Compare School Performance*;
  workforce → *Explore Education Statistics*; finance → *Financial Benchmarking & Insights Tool*.
  They are not interchangeable (see DOCUMENTATION.md §9).

## Refreshing

Re-run the relevant `etl:*` when the source publishes a newer year, then **commit the regenerated
JSON** and push (`main` auto-deploys). The JSON outputs are committed artifacts, not gitignored.

## If a gov.uk download fails

Date-stamped endpoints occasionally 5xx. Download the file by hand (the script header has the
source page) and pass the local path as an argument, as above.
