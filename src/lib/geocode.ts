import { AreaFacts, LatLng } from "./types";
import { imdDomainsForLsoa } from "./imd";

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
          constituency: r.parliamentary_constituency,
          lsoa: r.lsoa,
          lsoaCode,
          lauaCode: r.codes?.admin_district,
          imdRank,
          imdDecile,
          imdDomains: imdDomainsForLsoa(lsoaCode) ?? null,
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
        },
      };
    }
  }

  throw new Error(`Couldn’t find “${raw}”. Try a full UK postcode like “SW11 6QT”.`);
}
