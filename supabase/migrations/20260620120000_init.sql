-- AreaIQ / area-intel — initial PostGIS schema
-- Apply with:  supabase db push     (Supabase CLI)
--         or:  psql "$DATABASE_URL" -f supabase/migrations/20260620120000_init.sql
--
-- All point geometries use SRID 4326 (WGS84). Point `geom` columns are GENERATED from
-- lat/lng so pipelines only set lat/lng. GIST indexes power "within radius" queries via
--   ST_DWithin(geom::geography, ST_MakePoint(lng,lat)::geography, metres)

create extension if not exists postgis;

-- ── Geo lookup ────────────────────────────────────────────────────────────────
-- Postcode cache (source: postcodes.io / ONS Postcode Directory)
create table if not exists postcodes (
  postcode        text primary key,            -- normalised, e.g. "SW11 6QT"
  lat             double precision not null,
  lng             double precision not null,
  geom            geometry(Point, 4326)
                    generated always as (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) stored,
  country         text,
  region          text,
  admin_district  text,
  admin_ward      text,
  lsoa_code       text,
  msoa_code       text,
  constituency    text,
  imd_rank        integer,
  imd_decile      smallint,
  updated_at      timestamptz default now()
);
create index if not exists postcodes_geom_idx on postcodes using gist (geom);
create index if not exists postcodes_lsoa_idx on postcodes (lsoa_code);

-- ── Schools ───────────────────────────────────────────────────────────────────
-- Source: DfE Get Information About Schools (GIAS) register
create table if not exists schools (
  urn                 integer primary key,
  name                text not null,
  establishment_type  text,
  establishment_group text,                     -- academy / LA maintained / independent / free / faith
  phase               text,                     -- primary / secondary / all-through / 16 plus / nursery
  status              text,                     -- open / closed
  gender              text,                     -- mixed / boys / girls
  religious_character text,
  age_low             smallint,
  age_high            smallint,
  has_sixth_form      boolean,
  capacity            integer,
  number_on_roll      integer,
  la_code             text,
  la_name             text,
  street              text,
  town                text,
  postcode            text,
  lat                 double precision,
  lng                 double precision,
  geom                geometry(Point, 4326)
                        generated always as (
                          case when lat is not null and lng is not null
                               then ST_SetSRID(ST_MakePoint(lng, lat), 4326) end
                        ) stored,
  ukprn               text,
  last_changed        date,
  updated_at          timestamptz default now()
);
create index if not exists schools_geom_idx on schools using gist (geom);
create index if not exists schools_postcode_idx on schools (postcode);
create index if not exists schools_phase_idx on schools (phase);

-- Ofsted overall + sub-grades (overall: GIAS; sub-grades: Ofsted Management Information)
create table if not exists school_ofsted (
  urn                   integer primary key references schools(urn) on delete cascade,
  overall_grade         text,    -- Outstanding / Good / Requires improvement / Inadequate
  quality_of_education  text,
  leadership_management text,
  behaviour_attitudes   text,
  personal_development  text,
  early_years           text,
  sixth_form            text,
  inspection_date       date,
  previous_grade        text,
  report_url            text,
  updated_at            timestamptz default now()
);

-- KS2 (primary) by year — source: DfE Explore Education Statistics
create table if not exists school_ks2 (
  urn              integer references schools(urn) on delete cascade,
  year             smallint,
  reading_progress numeric(4,1),
  writing_progress numeric(4,1),
  maths_progress   numeric(4,1),
  rwm_expected_pct smallint,
  rwm_higher_pct   smallint,
  primary key (urn, year)
);

-- KS4 (GCSE) by year — source: DfE EES
create table if not exists school_ks4 (
  urn                     integer references schools(urn) on delete cascade,
  year                    smallint,
  progress8               numeric(4,2),
  attainment8             numeric(4,1),
  ebacc_entry_pct         smallint,
  ebacc_aps               numeric(4,2),
  basics_94_pct           smallint,    -- grade 4+ English & maths
  basics_95_pct           smallint,    -- grade 5+
  disadvantaged_progress8 numeric(4,2),
  primary key (urn, year)
);

-- KS5 (A-level) by year — source: DfE EES
create table if not exists school_ks5 (
  urn              integer references schools(urn) on delete cascade,
  year             smallint,
  alevel_aps       numeric(5,2),
  alevel_avg_grade text,
  value_added      numeric(4,2),
  primary key (urn, year)
);

-- Destinations (KS4 & KS5) — source: DfE EES destination measures
create table if not exists school_destinations (
  urn                integer references schools(urn) on delete cascade,
  year               smallint,
  key_stage          text,        -- 'ks4' | 'ks5'
  sustained_pct      smallint,
  he_pct             smallint,
  fe_pct             smallint,
  apprenticeship_pct smallint,
  employment_pct     smallint,
  neet_pct           smallint,
  primary key (urn, year, key_stage)
);

-- Pupil composition — source: DfE school census
create table if not exists school_census (
  urn             integer references schools(urn) on delete cascade,
  year            smallint,
  fsm_pct         numeric(4,1),
  eal_pct         numeric(4,1),
  sen_ehcp_pct    numeric(4,1),
  sen_support_pct numeric(4,1),
  primary key (urn, year)
);

-- Parent View survey — source: Ofsted Parent View
create table if not exists school_parentview (
  urn           integer primary key references schools(urn) on delete cascade,
  respondents   integer,
  happy_pct     smallint,
  safe_pct      smallint,
  behaviour_pct smallint,
  bullying_pct  smallint,
  send_pct      smallint,
  recommend_pct smallint,
  captured_at   date
);

-- Admissions / oversubscription (best-effort) — source: LA admissions
create table if not exists school_admissions (
  urn                     integer references schools(urn) on delete cascade,
  year                    smallint,
  last_distance_offered_m integer,     -- catchment proxy for MVP
  oversubscription_ratio  numeric(5,2),
  criteria_type           text,        -- catchment / faith / sibling / distance
  primary key (urn, year)
);

-- ── Area ──────────────────────────────────────────────────────────────────────
-- Index of Multiple Deprivation by LSOA — source: MHCLG/ONS IMD
create table if not exists imd (
  lsoa_code         text primary key,
  imd_rank          integer,
  imd_decile        smallint,
  income_score      numeric(6,4),
  employment_score  numeric(6,4),
  income_decile     smallint,
  employment_decile smallint
);

-- Crime aggregated by area + month — source: police.uk
-- (Raw point data is huge; the app keeps live point queries for the 1-mile circle.)
create table if not exists crime_by_area (
  lsoa_code text,
  month     date,            -- first of month
  category  text,
  count     integer,
  primary key (lsoa_code, month, category)
);
create index if not exists crime_area_month_idx on crime_by_area (lsoa_code, month);

-- Amenities — source: OpenStreetMap / Overpass (cache; also queryable live)
create table if not exists amenities (
  osm_type text,
  osm_id   bigint,
  category text,             -- gp / hospital / supermarket / park / gym / station / bus_stop ...
  name     text,
  lat      double precision,
  lng      double precision,
  geom     geometry(Point, 4326)
             generated always as (
               case when lat is not null and lng is not null
                    then ST_SetSRID(ST_MakePoint(lng, lat), 4326) end
             ) stored,
  primary key (osm_type, osm_id)
);
create index if not exists amenities_geom_idx on amenities using gist (geom);
create index if not exists amenities_category_idx on amenities (category);

-- ── Property ──────────────────────────────────────────────────────────────────
-- HM Land Registry Price Paid — source: Land Registry
create table if not exists price_paid (
  transaction_id text primary key,
  price          integer not null,
  date           date not null,
  postcode       text,
  paon           text,
  saon           text,
  street         text,
  town           text,
  district       text,
  county         text,
  property_type  text,        -- detached / semi-detached / terraced / flat / other
  new_build      boolean,
  tenure         text,        -- freehold / leasehold
  lat            double precision,
  lng            double precision,
  geom           geometry(Point, 4326)
                   generated always as (
                     case when lat is not null and lng is not null
                          then ST_SetSRID(ST_MakePoint(lng, lat), 4326) end
                   ) stored
);
create index if not exists price_paid_postcode_idx on price_paid (postcode);
create index if not exists price_paid_geom_idx on price_paid using gist (geom);
create index if not exists price_paid_date_idx on price_paid (date);

-- EPC ratings — source: MHCLG EPC register API (needs free API key)
create table if not exists epc (
  lmk_key            text primary key,
  postcode           text,
  address            text,
  current_rating     text,        -- A–G
  current_efficiency smallint,
  potential_rating   text,
  co2_per_year       numeric,
  energy_cost_year   numeric,
  property_type      text,
  total_floor_area   numeric,
  inspection_date    date,
  lat                double precision,
  lng                double precision,
  geom               geometry(Point, 4326)
                       generated always as (
                         case when lat is not null and lng is not null
                              then ST_SetSRID(ST_MakePoint(lng, lat), 4326) end
                       ) stored
);
create index if not exists epc_postcode_idx on epc (postcode);
create index if not exists epc_geom_idx on epc using gist (geom);

-- Flood risk polygons — source: Environment Agency
create table if not exists flood_risk (
  id        bigserial primary key,
  source    text,            -- 'river_sea' | 'surface_water'
  risk_band text,            -- High / Medium / Low / Very Low
  geom      geometry(MultiPolygon, 4326)
);
create index if not exists flood_risk_geom_idx on flood_risk using gist (geom);

-- ── Benchmarks & bookkeeping ───────────────────────────────────────────────────
-- National reference distributions for percentile context (DB home for benchmarks.json)
create table if not exists benchmark_distributions (
  metric       text primary key,    -- 'crime_1mi' | 'price_la_avg' | 'progress8' ...
  sample_count integer,
  samples      double precision[],  -- sorted ascending
  generated_at timestamptz default now()
);

create table if not exists etl_runs (
  id          bigserial primary key,
  source      text not null,
  status      text not null,        -- success / failed / partial
  rows_loaded integer,
  message     text,
  started_at  timestamptz,
  finished_at timestamptz default now()
);
