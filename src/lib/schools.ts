import { distanceMiles } from "./distance";
import { School, OfstedRating, LatLng, ParentView } from "./types";
import ofstedByUrn from "@/data/ofsted-by-urn.json";
import ks4ByUrn from "@/data/ks4-by-urn.json";
import parentviewByUrn from "@/data/parentview-by-urn.json";
import ks2ByUrn from "@/data/ks2-by-urn.json";
import censusByUrn from "@/data/census-by-urn.json";
import destinationsByUrn from "@/data/destinations-by-urn.json";

const OVERPASS = "https://overpass-api.de/api/interpreter";

interface OfstedRecord {
  rating: OfstedRating;
  date?: string;
  name?: string;
  report?: string;
  sub?: {
    education?: OfstedRating;
    behaviour?: OfstedRating;
    personal?: OfstedRating;
    leadership?: OfstedRating;
    eyfs?: OfstedRating;
    sixthForm?: OfstedRating;
  };
}

const ofstedMap = ofstedByUrn as Record<string, OfstedRecord>;

/** True once the ETL has populated src/data/ofsted-by-urn.json. */
export const ofstedLoaded: boolean = Object.keys(ofstedMap).length > 0;

interface Ks4Record {
  p8: number | null; // Progress 8 (P8MEA)
  att8: number | null; // Attainment 8 (ATT8SCR)
  ebaccEntry?: number | null;
  ebacc94?: number | null;
  disP8?: number | null;
  year: string;
}

const ks4Map = ks4ByUrn as Record<string, Ks4Record>;

interface PvRecord {
  happy: number; // % who agree "My child is happy at this school" (= q["1"].pos)
  responses?: number;
  q?: ParentView; // full survey breakdown
}

const pvMap = parentviewByUrn as Record<string, PvRecord>;

interface Ks2Record {
  rwmExp: number | null;
  rwmHigh: number | null;
  readProg: number | null;
  writProg: number | null;
  matProg: number | null;
  year: string;
}

const ks2Map = ks2ByUrn as Record<string, Ks2Record>;

interface CensusRecord {
  fsm: number | null;
  eal: number | null;
  senEhcp: number | null;
  senSupport: number | null;
}
const censusMap = censusByUrn as Record<string, CensusRecord>;

interface DestRecord {
  ks4?: {
    sustained: number | null;
    education: number | null;
    appren: number | null;
    employment: number | null;
    notSustained: number | null;
  };
  ks5?: {
    sustained: number | null;
    he: number | null;
    fe: number | null;
    appren: number | null;
    employment: number | null;
  };
}
const destMap = destinationsByUrn as Record<string, DestRecord>;

interface OverpassEl {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** Live school locations within `radiusMiles` of a point, from OpenStreetMap via Overpass. */
export async function fetchSchools(
  centre: LatLng,
  radiusMiles: number,
): Promise<School[]> {
  const radiusM = Math.round(radiusMiles * 1609.34);
  const q =
    `[out:json][timeout:25];(` +
    `node["amenity"="school"](around:${radiusM},${centre.lat},${centre.lng});` +
    `way["amenity"="school"](around:${radiusM},${centre.lat},${centre.lng});` +
    `relation["amenity"="school"](around:${radiusM},${centre.lat},${centre.lng});` +
    `);out center tags;`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  let elements: OverpassEl[] = [];
  try {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // Overpass rejects requests with no User-Agent (HTTP 406). Identify ourselves politely.
        "User-Agent": "area-intel/0.1 (UK area & school intelligence)",
      },
      body: "data=" + encodeURIComponent(q),
      signal: ctrl.signal,
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
    const json = await res.json();
    elements = (json.elements ?? []) as OverpassEl[];
  } finally {
    clearTimeout(timer);
  }

  const seen = new Set<string>();
  const schools: School[] = [];
  for (const el of elements) {
    const lat = el.lat ?? el.center?.lat;
    const lng = el.lon ?? el.center?.lon;
    const tags = el.tags ?? {};
    const name = tags.name;
    if (lat == null || lng == null || !name) continue;

    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);

    const urn = tags["ref:edubase"];
    const enr = urn ? ofstedMap[urn] : undefined;
    const ks4 = urn ? ks4Map[urn] : undefined;
    const pv = urn ? pvMap[urn] : undefined;
    const ks2 = urn ? ks2Map[urn] : undefined;
    const census = urn ? censusMap[urn] : undefined;
    const dest = urn ? destMap[urn] : undefined;
    schools.push({
      id,
      name,
      lat,
      lng,
      distanceMiles:
        Math.round(distanceMiles(centre.lat, centre.lng, lat, lng) * 10) / 10,
      urn,
      phase: phaseFromTags(tags),
      ofsted: enr?.rating ?? (ofstedLoaded ? "Not rated" : "Not loaded"),
      ofstedDate: enr?.date,
      progress8: ks4?.p8 ?? null,
      attainment8: ks4?.att8 ?? null,
      ks4Year: ks4?.year,
      ebaccEntry: ks4?.ebaccEntry ?? null,
      ebacc94: ks4?.ebacc94 ?? null,
      disadvantagedP8: ks4?.disP8 ?? null,
      parentViewHappy: pv?.happy ?? null,
      parentViewResponses: pv?.responses,
      parentView: pv?.q ?? null,
      ofstedReport: enr?.report,
      ofstedSub: enr?.sub,
      ks2: ks2 ?? null,
      composition: census,
      destinations: dest,
    });
  }

  schools.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return schools;
}

function phaseFromTags(tags: Record<string, string>): string | undefined {
  const isced = tags["isced:level"];
  if (isced) {
    if (/[01]/.test(isced) && !/[23]/.test(isced)) return "Primary";
    if (/[23]/.test(isced)) return "Secondary";
  }
  const min = parseInt(tags["min_age"] ?? "", 10);
  const max = parseInt(tags["max_age"] ?? "", 10);
  if (!Number.isNaN(max)) {
    if (max <= 11) return "Primary";
    if (!Number.isNaN(min) && min >= 11) return "Secondary";
    return "All-through";
  }
  return tags["school:type"] || tags["operator:type"] || undefined;
}
