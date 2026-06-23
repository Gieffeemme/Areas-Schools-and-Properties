import type { ReportCard } from "./reportCard";

export interface LatLng {
  lat: number;
  lng: number;
}

export type OfstedRating =
  | "Outstanding"
  | "Good"
  | "Requires improvement"
  | "Inadequate"
  | "Not rated"
  | "Not loaded";

// One Ofsted Parent View question's results. Fields used vary by question kind:
//   agreement (Q1-3,5,8-13,7b): pos/neg  ·  agreement+NA (Q4,6): pos/neg/na
//   Q7a SEND prevalence: yes  ·  Q14 would-recommend: pos (= % yes; neg implied = 100-pos)
export interface PvQuestion {
  pos?: number; // % positive (Strongly agree + Agree); for Q14, % who would recommend
  neg?: number; // % negative (Strongly disagree + Disagree)
  na?: number; // % "not applicable" - Q4 "not been bullied", Q6 "no concerns raised"
  yes?: number; // Q7a only: % of parents reporting their child has SEND
}
// Keyed by question id: "1".."6","7a","7b","8".."14". Suppressed questions are absent.
export type ParentView = Record<string, PvQuestion>;

export interface School {
  id: string; // "node/123" - OSM type/id
  name: string;
  lat: number;
  lng: number;
  distanceMiles: number;
  urn?: string; // from OSM tag ref:edubase, when present
  phase?: string; // Nursery / Primary / Secondary / Sixth form / College / All-through
  kind?: "special" | "alternative" | "independent"; // non-mainstream GIAS category; undefined = mainstream state school
  places?: number; // registered capacity (Ofsted Early Years nurseries)
  // GIAS register metadata (state/independent schools; nurseries carry `places` instead)
  pupils?: number; // number on roll
  gender?: string; // "Mixed" | "Boys" | "Girls"
  type?: string; // establishment type, e.g. "Academy converter", "Voluntary aided school"
  religion?: string; // religious character, when a faith school (e.g. "Roman Catholic")
  ageLow?: number; // statutory low age
  ageHigh?: number; // statutory high age
  selective?: boolean; // selective (grammar) admissions
  ofsted: OfstedRating;
  ofstedNoOverall?: boolean; // inspected since Sept 2024 - sub-judgements but no single overall grade
  ofstedDate?: string; // last inspection date, once enriched
  reportCard?: ReportCard | null; // new-framework report card (Nov 2025+): EY (scraped) or school (MI)
  progress8?: number | null; // KS4 Progress 8 (secondary only), from DfE
  attainment8?: number | null; // KS4 Attainment 8
  gcse5EM?: number | null; // % achieving grade 5+ in English & Maths (headline "strong pass")
  gcse4EM?: number | null; // % achieving grade 4+ in English & Maths ("standard pass")
  ks4Year?: string; // e.g. "2022/23"
  pupilTeacherRatio?: number | null; // pupils per teacher (FTE) - DfE School Workforce Census
  teachersFte?: number | null; // teaching staff, full-time equivalent
  staffFte?: number | null; // all staff (teachers + support), full-time equivalent
  workforceYear?: string; // e.g. "2023/24"
  financePerPupil?: number | null; // total expenditure per pupil (£) - DfE school finance
  financeReserve?: number | null; // revenue reserve (£); negative = in deficit
  financeInYear?: number | null; // in-year balance (£)
  financeYear?: string; // e.g. "2024/25"
  parentViewHappy?: number | null; // % agree "My child is happy" (Ofsted Parent View)
  parentViewResponses?: number;
  parentView?: ParentView | null; // full survey breakdown, keyed by question id ("1".."14","7a","7b")
  // Detail (for the drawer)
  ofstedReport?: string; // link to the school's Ofsted reports page
  ofstedSub?: {
    education?: OfstedRating;
    behaviour?: OfstedRating;
    personal?: OfstedRating;
    leadership?: OfstedRating;
    eyfs?: OfstedRating;
    sixthForm?: OfstedRating;
  };
  ebaccEntry?: number | null; // % entering the EBacc (KS4)
  ebacc94?: number | null; // % achieving EBacc grades 9-4 (KS4)
  disadvantagedP8?: number | null; // Progress 8 for disadvantaged pupils
  alevel?: {
    grade: string | null; // average result per A level entry, as a grade (e.g. "B-")
    aps: number | null; // average point score per A level entry (A*=60…E=10)
    aabFac: number | null; // % achieving AAB+ incl. >=2 facilitating subjects
    pupils: number | null; // A level cohort size
    year: string;
  } | null;
  ks2?: {
    rwmExp: number | null; // % reaching expected standard (reading, writing & maths)
    rwmHigh: number | null; // % at higher standard
    readProg: number | null;
    writProg: number | null;
    matProg: number | null;
    year: string;
  } | null;
  composition?: {
    fsm: number | null; // % FSM (last 6 years)
    eal: number | null; // % English as additional language
    senEhcp: number | null; // % SEN with an EHC plan
    senSupport: number | null; // % SEN support
  };
  destinations?: {
    ks4?: {
      sustained: number | null;
      education: number | null;
      appren: number | null;
      employment: number | null;
      notSustained: number | null;
    };
    ks5?: {
      sustained: number | null;
      he: number | null; // higher education / university
      fe: number | null;
      appren: number | null;
      employment: number | null;
    };
  };
}

// A school/nursery name-search hit (from the GIAS + Early Years registers). `id` matches School.id
// so the UI can auto-open the matching card after running the area report at `postcode`.
export interface SchoolMatch {
  id: string; // "gias/{urn}" or "ey/{urn}"
  name: string;
  phase?: string;
  postcode: string;
  lat: number;
  lng: number;
}

// One specific address at a postcode (from the EPC register), for the property picker.
export interface AddressMatch {
  uprn: string;
  certificateNumber?: string;
  line1: string; // leading address line, e.g. "68 Oxney Road"
  address: string; // full single-line address
  postcode: string;
  epcBand: string | null; // current energy band, when certificated
  epcDate?: string; // certificate registration date (ISO)
  ctaxBand?: string | null; // council-tax band, for VOA-sourced rows with no EPC
}

// A place (town / city / suburb / borough) name-search hit, from postcodes.io Places (OS Open Names).
export interface PlaceMatch {
  id: string;
  name: string; // e.g. "Leeds"
  area?: string; // disambiguator, e.g. "West Yorkshire" / "Greater London"
  lat: number;
  lng: number;
}

export interface FloodSummary {
  status: "warning-area" | "alert-area" | "clear"; // does an EA flood area contain the point
  areaName?: string; // description of the containing flood area
  riverOrSea?: string; // source of the flood risk
  activeWarnings: number; // EA warnings/alerts in force near the point right now
  topSeverity?: string; // most severe active warning, e.g. "Flood alert"
}

// One planning application near a point, from PlanIt (a third-party aggregator of UK local-authority
// planning registers - no official national API exists). Status/dates are as PlanIt last scraped them.
export interface PlanningApplication {
  reference: string; // council application reference, e.g. "26/03919/FULL"
  address: string; // site address
  description: string; // what's proposed
  status: string; // PlanIt app_state: Permitted / Undecided / Refused / Withdrawn / Conditions / ...
  type: string; // PlanIt app_type: Full / Outline / Advertising / ...
  date: string; // application/validated date (ISO), used to sort most-recent-first
  decidedDate?: string; // decision date, when decided
  authority: string; // the local planning authority (PlanIt area_name)
  distanceKm: number; // straight-line from the query point
  url: string; // deep link to the official council record (falls back to the PlanIt page)
}

// Planning applications near a point, from PlanIt. `total` is the all-time count PlanIt holds for the
// area around the point; `recent` is the most-recently-submitted few.
export interface PlanningSummary {
  total: number;
  radiusKm: number;
  recent: PlanningApplication[];
}

// Planning CONSTRAINTS at a point, from MHCLG's planning.data.gov.uk (live spatial query, OGL v3) -
// distinct from the planning APPLICATIONS above (PlanIt). One area designation whose polygon contains
// the point (conservation area, article-4 direction, green belt, AONB, national park, world heritage
// site, scheduled monument, tree-preservation zone).
export interface PlanningDesignation {
  dataset: string; // planning.data.gov.uk dataset, e.g. "conservation-area"
  label: string; // display label, e.g. "Conservation area"
  name: string; // the designation's name, e.g. "Bath" (can be empty for some datasets)
  reference: string;
  url: string; // the entity page on planning.data.gov.uk
}

// A listed building near the point (Historic England, via planning.data.gov.uk).
export interface ListedBuilding {
  name: string;
  grade: string; // "I" | "II*" | "II" (England); "" if unknown
  distanceMetres: number;
  url: string; // Historic England list-entry page (documentation-url)
}

export interface PlanningConstraintsSummary {
  designations: PlanningDesignation[]; // area designations containing the point
  listed: {
    count: number; // listed buildings within the radius
    capped: boolean; // true if the count hit the fetch cap (very dense heritage area) → show "N+"
    radiusMetres: number;
    nearest: ListedBuilding[]; // nearest first, a handful
  };
}

// Domestic EPC summary for a postcode (MHCLG "Get energy performance of buildings data").
export interface EpcSummary {
  postcode: string;
  count: number; // distinct dwellings with an EPC (latest certificate each)
  bands: Record<string, number>; // energy band A-G → count
  typicalBand: string | null; // most common band
}

// Council Tax band mix for an LSOA (neighbourhood), from the VOA "stock of properties" stats
// (table CTSOP4.1). Counts are VOA-rounded to 10; England has bands A-H, Wales A-I.
export interface CouncilTaxSummary {
  total: number; // dwellings on the valuation list in the LSOA
  bands: Record<string, number>; // band A-I → count
  typicalBand: string | null; // most common band
  typicalCost?: number | null; // actual £/yr for the typical band, all precepts in (MHCLG, England)
}

export interface CrimeCategoryCount {
  category: string;
  count: number;
}

export interface CrimeSummary {
  month: string; // "YYYY-MM" of the police.uk data
  total: number;
  byCategory: CrimeCategoryCount[];
  nationalBaseline: number; // expected incidents for an area this size
  ratioToNational: number; // total / baseline (1 = average)
  radiusMiles: number; // fixed ~1 (police.uk constraint)
}

export interface PriceSale {
  date: string; // ISO date
  price: number;
  paon?: string;
  street?: string;
  type?: string; // detached / semi-detached / terraced / flat-maisonette / other
  tenure?: "freehold" | "leasehold"; // HM Land Registry estate type
}

export interface PriceYear {
  year: number;
  averagePrice: number;
  medianPrice: number;
  count: number;
}

export interface PriceSummary {
  postcode: string; // the searched postcode
  scope: "postcode" | "sector"; // geography the figures actually cover
  area: string; // display label for that geography, e.g. "SW2 1AA" or "SW2 1"
  sales: PriceSale[]; // most recent first (trimmed)
  count: number; // total sales returned
  averagePrice: number | null; // mean - feeds the national price benchmark
  medianPrice: number | null; // median - the headline figure (robust to commercial outliers)
  byYear: PriceYear[];
  tenure: { freehold: number; leasehold: number } | null; // freehold/leasehold split of these sales
}

// IMD 2019 domain deciles (1 = most deprived 10% of England's LSOAs, 10 = least).
export interface ImdDomains {
  income: number | null;
  employment: number | null;
  education: number | null;
  health: number | null;
  crime: number | null;
  housing: number | null; // Barriers to Housing and Services
  living: number | null; // Living Environment
}

export interface AreaFacts {
  postcode: string;
  label?: string; // human place name for a town/city/area search (shown instead of the postcode)
  district?: string;
  region?: string;
  country?: string; // "England" | "Scotland" | "Wales" | "Northern Ireland" (postcodes.io)
  constituency?: string;
  lsoa?: string; // LSOA name (display)
  lsoaCode?: string; // LSOA 2011 code (join key for IMD domains)
  lsoa21Code?: string; // LSOA 2021 code (join key for Census 2021)
  lauaCode?: string; // local authority (LAUA) ONS code (join key for broadband)
  easting?: number; // OSGB easting (postcodes.io) — join key for the air-quality 1 km grid
  northing?: number; // OSGB northing (postcodes.io)
  imdRank?: number | null; // England rank; 1 = most deprived
  imdDecile?: number | null; // 1 = most deprived 10%, 10 = least
  imdDomains?: ImdDomains | null; // per-domain deciles for the LSOA
  councilTax?: CouncilTaxSummary | null; // VOA band mix for the LSOA (England & Wales)
}

export interface MetricBenchmark {
  percentile: number; // 0-100 position within the England sample (higher value ⇒ higher %)
  sampleSize: number;
}

export interface AreaBenchmarks {
  crime: MetricBenchmark | null; // by monthly incident count (higher = more crime)
  price: MetricBenchmark | null; // by average sold price (higher = pricier)
  sampleGeneratedAt: string | null;
}

export interface SourceError {
  source: "schools" | "crime" | "prices" | "noise";
  message: string;
}

export interface AmenityCategory {
  key: string;
  label: string;
  count: number;
  nearestMiles: number | null; // distance to the nearest of this category, within the radius
}

export interface AmenitySummary {
  radiusMiles: number; // ~1 mile around the point (walkable "what's nearby")
  categories: AmenityCategory[];
}

// Public EV charging near a point, from a committed OpenStreetMap dataset (build-ev-charging.mjs). The
// National Chargepoint Registry was decommissioned (Nov 2024); OSM is the free national source. Location,
// operator and capacity (number of charge points) only - connector type/power are too sparsely tagged.
export interface EvCharger {
  operator: string; // OSM operator / network / name (may be empty)
  capacity: number | null; // number of charge points at the site, where recorded
  distanceMiles: number;
}

export interface EvChargingSummary {
  radiusMiles: number;
  count: number; // charging locations within the radius
  nearest: EvCharger[]; // nearest first, a handful
}

// Nearest public-transport station to a point, from OpenStreetMap (Overpass). A *connectivity* signal
// - the named nearest rail/metro/tram station however far - distinct from the amenities walkable
// density count (stations within 1 mile). Distances are straight-line, not routed (no commute times:
// that needs a paid routing API).
export interface TransportStation {
  name: string;
  kind: "rail" | "metro" | "light_rail" | "tram"; // classified from OSM tags
  distanceMiles: number; // straight-line from the point
  lat: number;
  lng: number;
  osm?: string; // OpenStreetMap feature ref ("node/123") for a "view source" link
}

export interface TransportSummary {
  stations: TransportStation[]; // nearest first, up to a few
  searchRadiusMiles: number; // how far we looked (a station may simply be beyond it)
}

// One CQC-regulated health/care location near a point (GP, dentist, care home, hospital, home-care
// agency), with its latest CQC overall rating. From the committed CQC directory (build-cqc.mjs).
export interface CqcLocation {
  name: string;
  category: string; // display label: "GP practice" / "Dentist" / "Care home" / "Hospital" / "Home care agency"
  rating: OfstedRating; // latest CQC overall rating (shares Ofsted's Outstanding→Inadequate scale)
  ratingDate: string | null; // ISO date that rating was published; null if unrated
  distanceMiles: number; // straight-line from the point
  url: string; // CQC profile page (https://www.cqc.org.uk/location/{id})
}

// CQC-rated health & care services near a point, from the committed directory (CQC "care directory with
// filters", Open Government Licence) - a radius lookup like amenities/stations, not a live API call.
export interface CqcSummary {
  radiusMiles: number; // how far we looked
  total: number; // CQC-regulated locations within the radius
  rated: number; // how many of those carry an actual overall rating (CQC doesn't rate every service)
  byRating: Partial<Record<OfstedRating, number>>; // Outstanding/Good/Requires improvement/Inadequate → count
  asAt: string | null; // snapshot date of the CQC directory, for provenance
  nearest: CqcLocation[]; // nearest first, a handful (rated preferred)
}

export interface BroadbandSummary {
  laName: string;
  superfast: number | null; // % premises with superfast (30+ Mbit/s)
  ultrafast: number | null; // % with ultrafast
  fullFibre: number | null; // % with full fibre
  gigabit: number | null; // % gigabit-capable
  belowUso: number | null; // % below the USO (can't get a decent connection)
}

// Ofcom mobile coverage for a local authority (Connected Nations, by LAUA - same release/join as
// broadband). Percentages of premises; "any" = at least one of the four MNOs, "all" = all four.
export interface MobileSummary {
  laName: string;
  fourGAny: number | null; // % premises with indoor 4G from at least one operator
  fourGAll: number | null; // % premises with indoor 4G from all four operators
  fiveGAny: number | null; // % premises with outdoor 5G from at least one operator
}

// Environmental noise at the searched point, from Defra strategic noise mapping (Round 4, 2021).
// Each level is the modelled dB at the location; null = below the mapping threshold (40 dB Lden /
// 35 dB Lnight), i.e. no significant source of that kind nearby.
export interface NoiseSource {
  lden: number | null; // day-evening-night level (overall annoyance)
  lnight: number | null; // night-time level (sleep disturbance)
}

export interface NoiseSummary {
  road: NoiseSource;
  rail: NoiseSource;
  year: string; // snapshot year of the Round 4 maps ("2021")
}

// Modelled annual-mean background air pollution at the searched point, from Defra's Pollution Climate
// Mapping (PCM) 1 km background maps. Concentrations in µg/m³; null = the point is outside the GB grid
// (e.g. Northern Ireland, which uses the Irish grid). From the committed dataset (build-air-quality.mjs).
export interface AirQualitySummary {
  no2: number | null; // annual-mean nitrogen dioxide (µg/m³); UK legal limit 40, WHO 2021 guideline 10
  pm25: number | null; // annual-mean fine particulates (µg/m³); WHO 2021 guideline 5, England 2040 target 10
  year: number; // PCM model year of the maps
}

// One 5-year age band as a share of residents (for the age sparkline).
export interface AgeBand {
  label: string; // e.g. "30-34" or "85+"
  pct: number;
}

// Census 2021 area demographics ("who lives here") for the LSOA, from ONS via Nomis. England & Wales
// only. Each block is null if that table didn't resolve; the whole summary is null off-coverage.
export interface CensusSummary {
  population: number | null; // usual residents (Census 2021)
  households: number | null;
  age: {
    median: number | null; // interpolated from the 5-year bands
    under15: number | null; // % aged 0-14
    working: number | null; // % aged 15-64 (approx)
    over65: number | null; // % aged 65+
    bands: AgeBand[];
  } | null;
  tenure: { owned: number; socialRented: number; privateRented: number; other: number } | null; // %
  economic: { inEmployment: number; active: number; inactive: number } | null; // % of usual residents 16+
  qualifications: { level4plus: number; none: number } | null; // % of usual residents 16+
  household: { onePerson: number; family: number; other: number } | null; // % of households
}

// A report for ONE specific property (the property route): per-address facts from EPC, VOA and
// HM Land Registry + the Environment Agency, plus the LSOA/area context it sits in.
// Full domestic EPC certificate details (MHCLG /api/certificate?certificate_number=), beyond the band.
export interface EpcCertificate {
  currentBand: string | null;
  currentScore: number | null; // SAP energy rating 0-100 (current)
  potentialBand: string | null;
  potentialScore: number | null; // SAP rating with recommended improvements
  floorAreaSqm: number | null;
  dwellingType: string | null; // e.g. "End-terrace house"
  habitableRooms: number | null;
  mainHeating: string | null;
  secondaryHeating: string | null;
  hotWater: string | null;
  walls: string | null;
  roof: string | null;
  floor: string | null;
  windows: string | null;
  lowEnergyLightingPct: number | null;
  co2Current: number | null; // tonnes CO2 per year (current)
  inspectionDate: string | null;
}

export interface PropertyReport {
  address: string; // full single-line address
  line1: string; // leading line, e.g. "42 Oxney Road"
  postcode: string;
  uprn: string;
  centre: LatLng; // postcode-centroid coordinates (no exact per-building point without OS Places)
  facts: AreaFacts; // the LSOA/area context around it
  epc: { band: string | null; date?: string; lmk?: string } | null; // current energy band + certificate (EPC register)
  epcDetails: EpcCertificate | null; // full certificate: floor area, heating, fabric, current/potential rating
  councilTax: {
    band: string | null;
    source: "voa" | "lsoa-typical"; // exact band (VOA) vs the neighbourhood's typical band (LSOA)
    annualCost?: number | null; // actual £/yr for that band, all precepts in (MHCLG, England)
    neighbourhood?: CouncilTaxSummary | null; // the LSOA band distribution, for context
  };
  sales: PriceSale[]; // this address's sale history, newest first
  tenure: "freehold" | "leasehold" | null; // from the most recent sale that records it
  flood: FloodSummary | null;
  planning: PlanningSummary | null; // planning applications near the point (PlanIt); null = lookup failed
  planningConstraints: PlanningConstraintsSummary | null; // designations + listed buildings (planning.data.gov.uk); null = lookup failed
  transport: TransportSummary | null; // nearest rail/metro/tram stations (OSM); null = lookup failed
  cqc: CqcSummary | null; // CQC-rated health/care services near the point (committed directory); null = dataset missing
  generatedAt: string;
}

export interface AreaReport {
  query: string;
  centre: LatLng;
  radiusMiles: number;
  facts: AreaFacts;
  schools: School[];
  crime: CrimeSummary | null;
  prices: PriceSummary | null;
  amenities: AmenitySummary | null;
  evCharging: EvChargingSummary | null; // public EV charging near the point (committed OSM); supplementary
  transport: TransportSummary | null; // nearest rail/metro/tram stations (OSM); supplementary, non-blocking
  broadband: BroadbandSummary | null;
  mobile: MobileSummary | null; // Ofcom mobile coverage (4G/5G) for the LAUA; UK-wide
  noise: NoiseSummary | null;
  airQuality: AirQualitySummary | null; // modelled background NO2/PM2.5 at the point (Defra PCM); GB only
  census: CensusSummary | null; // Census 2021 demographics for the LSOA (ONS/Nomis); England & Wales only
  benchmarks: AreaBenchmarks; // national percentile context (from etl:benchmarks)
  ofstedLoaded: boolean; // whether the Ofsted enrichment dataset is present
  errors: SourceError[]; // per-source failures (honest partial results)
  generatedAt: string;
}
