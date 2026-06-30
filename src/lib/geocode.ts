import { AreaFacts, CouncilTaxSummary, LatLng, PlaceMatch } from "./types";
import { imdDomainsForLsoa } from "./imd";
import { wimdForLsoa } from "./wimd";
import { simdForDatazone } from "./simd";
import { nimdmForSoa } from "./nimdm";
import { scotlandCrimeForLaua } from "./scotlandCrime";
import { greenSpaceForArea } from "./greenspace";
import { councilTaxForLsoa, councilTaxCostForLaua, scotlandCouncilTaxForLaua } from "./councilTax";

// The council-tax band mix + the typical band's actual £/yr, for the area report's Property-checks panel
// and the per-property report. England/Wales: VOA band mix by LSOA + MHCLG £/band by LA. Scotland: a
// council-area band mix + SG £/band, keyed by the S12 council code (no neighbourhood band mix is published).
function councilTaxFacts(lsoaCode?: string, lauaCode?: string): CouncilTaxSummary | null {
  if (lauaCode?.startsWith("S12")) return scotlandCouncilTaxForLaua(lauaCode) ?? null;
  const ct = councilTaxForLsoa(lsoaCode);
  if (!ct) return null;
  if (ct.typicalBand) ct.typicalCost = councilTaxCostForLaua(lauaCode)?.[ct.typicalBand] ?? null;
  return ct;
}

// Number of LSOAs in the English IMD 2019 ranking (used to derive a decile).
const ENGLAND_LSOA_COUNT = 32844;

export interface GeocodeResult {
  centre: LatLng;
  facts: AreaFacts;
}

/**
 * Resolve a UK postcode (or outcode like "SW11") to coordinates + area facts via
 * postcodes.io. No API key required.
 */
export async function geocodePostcode(raw: string): Promise<GeocodeResult> {
  const cleaned = raw.trim().toUpperCase();
  const compact = cleaned.replace(/\s+/g, "");

  // 1) Full postcode
  const res = await fetch(
    `https://api.postcodes.io/postcodes/${encodeURIComponent(compact)}`,
    { next: { revalidate: 86400 } },
  );
  if (res.ok) {
    const r = (await res.json()).result;
    if (r) {
      const isEngland = r.country === "England";
      const imdRank =
        typeof r.index_of_multiple_deprivation === "number"
          ? r.index_of_multiple_deprivation
          : null;
      const imdDecile =
        isEngland && imdRank
          ? Math.min(10, Math.max(1, Math.ceil((imdRank / ENGLAND_LSOA_COUNT) * 10)))
          : null;
      const lsoaCode: string | undefined = r.codes?.lsoa;
      return {
        centre: { lat: r.latitude, lng: r.longitude },
        facts: {
          postcode: r.postcode,
          district: r.admin_district,
          region: r.region,
          country: r.country,
          constituency: r.parliamentary_constituency,
          lsoa: r.lsoa,
          lsoaCode,
          lsoa21Code: r.codes?.lsoa21,
          lauaCode: r.codes?.admin_district,
          msoaCode: r.codes?.msoa,
          msoa21Code: r.codes?.msoa21,
          easting: typeof r.eastings === "number" ? r.eastings : undefined,
          northing: typeof r.northings === "number" ? r.northings : undefined,
          imdRank,
          imdDecile,
          imdDomains: imdDomainsForLsoa(lsoaCode) ?? null,
          wimd: wimdForLsoa(lsoaCode) ?? null,
          simd: simdForDatazone(r.codes?.lsoa11) ?? null, // SIMD 2020 = 2011 data zone (codes.lsoa11)
          nimdm: nimdmForSoa(r.codes?.lsoa11) ?? null, // NIMDM 2017 = NI SOA (codes.lsoa11, e.g. 95GG20S1)
          scotlandCrime: scotlandCrimeForLaua(r.codes?.admin_district) ?? null, // council-area crime (Scotland)
          greenSpace: greenSpaceForArea(r.codes?.lsoa11, r.codes?.msoa) ?? null, // ONS green space + gardens (GB)
          councilTax: councilTaxFacts(lsoaCode, r.codes?.admin_district),
        },
      };
    }
  }

  // 2) Outcode fallback (district centroid), e.g. user typed "SW11"
  const oc = await fetch(
    `https://api.postcodes.io/outcodes/${encodeURIComponent(compact)}`,
    { next: { revalidate: 86400 } },
  );
  if (oc.ok) {
    const r = (await oc.json()).result;
    if (r) {
      return {
        centre: { lat: r.latitude, lng: r.longitude },
        facts: {
          postcode: r.outcode,
          district: Array.isArray(r.admin_district) ? r.admin_district[0] : undefined,
          region: Array.isArray(r.region) ? r.region[0] : undefined,
          country: Array.isArray(r.country) ? r.country[0] : undefined,
        },
      };
    }
  }

  // 3) Place-name fallback (town / city / suburb), e.g. "Leeds", "Chelsea". Picks the best match;
  // the search box's autocomplete lets the user disambiguate before it gets here.
  const places = await searchPlaces(raw);
  if (places.length) return geocodePoint(places[0].lat, places[0].lng, places[0].name);

  throw new Error(`Couldn’t find “${raw}”. Try a UK postcode, a school name, or a place like “Leeds”.`);
}

const TYPE_RANK: Record<string, number> = {
  City: 0,
  Town: 1,
  "Suburban Area": 2,
  "Other Settlement": 3,
  Village: 4,
  Hamlet: 5,
};

interface PlaceApi {
  code?: string;
  name_1?: string;
  local_type?: string;
  county_unitary?: string;
  district_borough?: string;
  region?: string;
  latitude: number;
  longitude: number;
}

/**
 * Town / city / suburb / borough suggestions for the search box, from postcodes.io Places (OS Open
 * Names). Ranked by settlement prominence (City > Town > …), with an `area` disambiguator so repeats
 * (e.g. Shoreditch in London vs Somerset) are distinguishable. Returns [] on any failure.
 */
export async function searchPlaces(query: string): Promise<PlaceMatch[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  let items: PlaceApi[] = [];
  try {
    const res = await fetch(
      `https://api.postcodes.io/places?q=${encodeURIComponent(q)}&limit=20`,
      { next: { revalidate: 86400 } },
    );
    if (!res.ok) return [];
    items = ((await res.json()).result ?? []) as PlaceApi[];
  } catch {
    return [];
  }
  const lc = q.toLowerCase();
  const out: PlaceMatch[] = [];
  const seen = new Set<string>();
  items
    .sort((a, b) => {
      const ax = a.name_1?.toLowerCase() === lc ? 0 : 1; // exact name match first
      const bx = b.name_1?.toLowerCase() === lc ? 0 : 1;
      return ax - bx || (TYPE_RANK[a.local_type ?? ""] ?? 9) - (TYPE_RANK[b.local_type ?? ""] ?? 9);
    })
    .forEach((p) => {
      const name = p.name_1;
      if (!name || typeof p.latitude !== "number" || typeof p.longitude !== "number") return;
      const area =
        p.county_unitary && p.county_unitary !== name
          ? p.county_unitary
          : p.region || p.district_borough || undefined;
      const key = `${name}|${area ?? ""}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push({ id: p.code ?? key, name, area, lat: p.latitude, lng: p.longitude });
    });
  return out.slice(0, 6);
}

/**
 * Build an area-report context for a coordinate (from a picked place). Reverse-geocodes to the
 * nearest postcode so IMD / prices / broadband still resolve, while `centre` stays the place centroid
 * and `label` (the place name) is shown in the header instead of the postcode.
 */
export async function geocodePoint(lat: number, lng: number, label?: string): Promise<GeocodeResult> {
  let r:
    | {
        postcode?: string;
        admin_district?: string;
        region?: string;
        country?: string;
        parliamentary_constituency?: string;
        lsoa?: string;
        codes?: { lsoa?: string; lsoa11?: string; lsoa21?: string; admin_district?: string; msoa?: string; msoa21?: string };
        eastings?: number;
        northings?: number;
        index_of_multiple_deprivation?: number;
      }
    | null = null;
  try {
    const res = await fetch(
      `https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}&limit=1&radius=2000`,
      { next: { revalidate: 86400 } },
    );
    if (res.ok) r = (await res.json()).result?.[0] ?? null;
  } catch {
    /* fall through to a minimal result */
  }
  if (!r) {
    // No postcode within range (rare) - still give a usable centre + label, just no postcode facts.
    return { centre: { lat, lng }, facts: { postcode: "", label } };
  }
  const isEngland = r.country === "England";
  const imdRank =
    typeof r.index_of_multiple_deprivation === "number" ? r.index_of_multiple_deprivation : null;
  const imdDecile =
    isEngland && imdRank
      ? Math.min(10, Math.max(1, Math.ceil((imdRank / ENGLAND_LSOA_COUNT) * 10)))
      : null;
  const lsoaCode = r.codes?.lsoa;
  return {
    centre: { lat, lng },
    facts: {
      postcode: r.postcode ?? "",
      label: label ?? r.admin_district,
      district: r.admin_district,
      region: r.region,
      country: r.country,
      constituency: r.parliamentary_constituency,
      lsoa: r.lsoa,
      lsoaCode,
      lsoa21Code: r.codes?.lsoa21,
      lauaCode: r.codes?.admin_district,
      msoaCode: r.codes?.msoa,
      msoa21Code: r.codes?.msoa21,
      easting: typeof r.eastings === "number" ? r.eastings : undefined,
      northing: typeof r.northings === "number" ? r.northings : undefined,
      imdRank,
      imdDecile,
      imdDomains: imdDomainsForLsoa(lsoaCode) ?? null,
      wimd: wimdForLsoa(lsoaCode) ?? null,
      simd: simdForDatazone(r.codes?.lsoa11) ?? null, // SIMD 2020 = 2011 data zone (codes.lsoa11)
      nimdm: nimdmForSoa(r.codes?.lsoa11) ?? null, // NIMDM 2017 = NI SOA (codes.lsoa11, e.g. 95GG20S1)
      scotlandCrime: scotlandCrimeForLaua(r.codes?.admin_district) ?? null, // council-area crime (Scotland)
      greenSpace: greenSpaceForArea(r.codes?.lsoa11, r.codes?.msoa) ?? null, // ONS green space + gardens (GB)
      councilTax: councilTaxFacts(lsoaCode, r.codes?.admin_district),
    },
  };
}
