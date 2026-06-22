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
  na?: number; // % "not applicable" — Q4 "not been bullied", Q6 "no concerns raised"
  yes?: number; // Q7a only: % of parents reporting their child has SEND
}
// Keyed by question id: "1".."6","7a","7b","8".."14". Suppressed questions are absent.
export type ParentView = Record<string, PvQuestion>;

export interface School {
  id: string; // "node/123" — OSM type/id
  name: string;
  lat: number;
  lng: number;
  distanceMiles: number;
  urn?: string; // from OSM tag ref:edubase, when present
  phase?: string; // Nursery / Primary / Secondary / Sixth form / College / All-through
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
  ofstedDate?: string; // last inspection date, once enriched
  reportCard?: ReportCard | null; // new-framework (Nov 2025+) EY report card, when scraped
  progress8?: number | null; // KS4 Progress 8 (secondary only), from DfE
  attainment8?: number | null; // KS4 Attainment 8
  gcse5EM?: number | null; // % achieving grade 5+ in English & Maths (headline "strong pass")
  gcse4EM?: number | null; // % achieving grade 4+ in English & Maths ("standard pass")
  ks4Year?: string; // e.g. "2022/23"
  pupilTeacherRatio?: number | null; // pupils per teacher (FTE) — DfE School Workforce Census
  teachersFte?: number | null; // teaching staff, full-time equivalent
  staffFte?: number | null; // all staff (teachers + support), full-time equivalent
  workforceYear?: string; // e.g. "2023/24"
  financePerPupil?: number | null; // total expenditure per pupil (£) — DfE school finance
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

export interface FloodSummary {
  status: "warning-area" | "alert-area" | "clear"; // does an EA flood area contain the point
  areaName?: string; // description of the containing flood area
  riverOrSea?: string; // source of the flood risk
  activeWarnings: number; // EA warnings/alerts in force near the point right now
  topSeverity?: string; // most severe active warning, e.g. "Flood alert"
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
  averagePrice: number | null; // mean — feeds the national price benchmark
  medianPrice: number | null; // median — the headline figure (robust to commercial outliers)
  byYear: PriceYear[];
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
  district?: string;
  region?: string;
  country?: string; // "England" | "Scotland" | "Wales" | "Northern Ireland" (postcodes.io)
  constituency?: string;
  lsoa?: string; // LSOA name (display)
  lsoaCode?: string; // LSOA 2011 code (join key for IMD domains)
  lauaCode?: string; // local authority (LAUA) ONS code (join key for broadband)
  imdRank?: number | null; // England rank; 1 = most deprived
  imdDecile?: number | null; // 1 = most deprived 10%, 10 = least
  imdDomains?: ImdDomains | null; // per-domain deciles for the LSOA
}

export interface MetricBenchmark {
  percentile: number; // 0–100 position within the England sample (higher value ⇒ higher %)
  sampleSize: number;
}

export interface AreaBenchmarks {
  crime: MetricBenchmark | null; // by monthly incident count (higher = more crime)
  price: MetricBenchmark | null; // by average sold price (higher = pricier)
  sampleGeneratedAt: string | null;
}

export interface SourceError {
  source: "schools" | "crime" | "prices" | "amenities" | "noise";
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

export interface BroadbandSummary {
  laName: string;
  superfast: number | null; // % premises with superfast (30+ Mbit/s)
  ultrafast: number | null; // % with ultrafast
  fullFibre: number | null; // % with full fibre
  gigabit: number | null; // % gigabit-capable
  belowUso: number | null; // % below the USO (can't get a decent connection)
}

// Environmental noise at the searched point, from Defra strategic noise mapping (Round 4, 2021).
// Each level is the modelled dB at the location; null = below the mapping threshold (40 dB Lden /
// 35 dB Lnight), i.e. no significant source of that kind nearby.
export interface NoiseSource {
  lden: number | null; // day–evening–night level (overall annoyance)
  lnight: number | null; // night-time level (sleep disturbance)
}

export interface NoiseSummary {
  road: NoiseSource;
  rail: NoiseSource;
  year: string; // snapshot year of the Round 4 maps ("2021")
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
  broadband: BroadbandSummary | null;
  noise: NoiseSummary | null;
  benchmarks: AreaBenchmarks; // national percentile context (from etl:benchmarks)
  ofstedLoaded: boolean; // whether the Ofsted enrichment dataset is present
  errors: SourceError[]; // per-source failures (honest partial results)
  generatedAt: string;
}
