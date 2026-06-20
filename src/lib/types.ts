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
  count: number;
}

export interface PriceSummary {
  postcode: string;
  sales: PriceSale[]; // most recent first (trimmed)
  count: number; // total sales returned
  averagePrice: number | null;
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
  ofstedLoaded: boolean; // whether the Ofsted enrichment dataset is present
  errors: SourceError[]; // per-source failures (honest partial results)
  generatedAt: string;
}
