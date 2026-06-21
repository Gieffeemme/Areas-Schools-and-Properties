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

export interface School {
  id: string; // "node/123" — OSM type/id
  name: string;
  lat: number;
  lng: number;
  distanceMiles: number;
  urn?: string; // from OSM tag ref:edubase, when present
  phase?: string; // Primary / Secondary / All-through (best-effort from OSM tags)
  ofsted: OfstedRating;
  ofstedDate?: string; // last inspection date, once enriched
  progress8?: number | null; // KS4 Progress 8 (secondary only), from DfE
  attainment8?: number | null; // KS4 Attainment 8
  ks4Year?: string; // e.g. "2022/23"
  parentViewHappy?: number | null; // % agree "My child is happy" (Ofsted Parent View)
  parentViewResponses?: number;
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

export interface AreaFacts {
  postcode: string;
  district?: string;
  region?: string;
  constituency?: string;
  lsoa?: string;
  imdRank?: number | null; // England rank; 1 = most deprived
  imdDecile?: number | null; // 1 = most deprived 10%, 10 = least
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
  source: "schools" | "crime" | "prices";
  message: string;
}

export interface AreaReport {
  query: string;
  centre: LatLng;
  radiusMiles: number;
  facts: AreaFacts;
  schools: School[];
  crime: CrimeSummary | null;
  prices: PriceSummary | null;
  benchmarks: AreaBenchmarks; // national percentile context (from etl:benchmarks)
  ofstedLoaded: boolean; // whether the Ofsted enrichment dataset is present
  errors: SourceError[]; // per-source failures (honest partial results)
  generatedAt: string;
}
