import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CqcLocation, CqcSummary, LatLng, OfstedRating } from "./types";
import { distanceMiles } from "./distance";
import { normaliseRating } from "./ratings";
import { cqcLocationUrl } from "./sources";

// CQC-rated health & care services near a point, from a COMMITTED dataset (build-cqc.mjs) - read from
// disk at runtime (memoised, like amenities.ts/imd.ts). The CQC Syndication API is key-gated and has no
// radius search (ratings live only in its per-location detail endpoint), so we instead ship CQC's free
// Open Government Licence "care directory with filters" bulk file as committed JSON: instant, no key, no
// per-request call. For each category (GP, dentist, care home, hospital, home-care) we surface the
// nearest one plus a rating-mix summary across the radius.
const RADIUS_MILES = 3; // a "local health & care" radius (wider than the 1-mile walkable amenities, so
// inherently sparse categories - hospitals, care homes - still surface)
// Cheap bounding-box guard (a bit over 3 miles at UK latitudes) to skip the haversine for far-away
// points while scanning the ~50k national array.
const DLAT = 0.05;
const DLNG = 0.085;

// Display order + label for the category keys stored in cqc-locations.json.
const CATEGORIES: { key: string; label: string }[] = [
  { key: "gp", label: "GP practice" },
  { key: "dentist", label: "Dentist" },
  { key: "care_home", label: "Care home" },
  { key: "hospital", label: "Hospital" },
  { key: "home_care", label: "Home care agency" },
];
const LABELS: Record<string, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

interface RawCqc {
  id: string;
  name: string;
  cat: string;
  rating: string; // raw CQC overall rating (or "")
  date: string | null; // ISO publication date
  pc: string;
  lat: number;
  lng: number;
}
interface CqcFile {
  asAt: string | null;
  count: number;
  locations: RawCqc[];
}

let cached: CqcFile | null | undefined;
function committed(): CqcFile | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src", "data", "cqc-locations.json"), "utf8"),
    ) as CqcFile;
  } catch {
    cached = null; // dataset missing (shouldn't happen in a real deploy) → degrade, don't 500
  }
  return cached;
}

// A real overall rating (Outstanding/Good/Requires improvement/Inadequate) vs CQC's many "no rating"
// states (Not applicable / Not rated / Insufficient evidence / blank), which normalise to "Not rated".
const isRated = (r: OfstedRating) => r !== "Not rated" && r !== "Not loaded";

export function nearbyCqc(centre: LatLng, radiusMiles = RADIUS_MILES): CqcSummary | null {
  const data = committed();
  if (data === null) return null;

  let total = 0;
  let rated = 0;
  const byRating: Partial<Record<OfstedRating, number>> = {};
  // Per category: the nearest RATED location, and the nearest of any (the fallback). This panel is about
  // care quality, so we lead with the nearest *rated* service - the literal nearest is often an unrated
  // private clinic - and fall back to the nearest unrated one only where nothing nearby is rated. The
  // distance is always shown, so "nearest rated GP, 0.4 mi" stays truthful.
  const bestRated = new Map<string, { raw: RawCqc; d: number }>();
  const bestAny = new Map<string, { raw: RawCqc; d: number }>();

  for (const raw of data.locations) {
    if (Math.abs(raw.lat - centre.lat) > DLAT || Math.abs(raw.lng - centre.lng) > DLNG) continue;
    const d = distanceMiles(centre.lat, centre.lng, raw.lat, raw.lng);
    if (d > radiusMiles) continue;
    total++;
    const r = normaliseRating(raw.rating);
    const curAny = bestAny.get(raw.cat);
    if (!curAny || d < curAny.d) bestAny.set(raw.cat, { raw, d });
    if (isRated(r)) {
      rated++;
      byRating[r] = (byRating[r] ?? 0) + 1;
      const curRated = bestRated.get(raw.cat);
      if (!curRated || d < curRated.d) bestRated.set(raw.cat, { raw, d });
    }
  }

  // One row per category present within the radius (nearest rated, else nearest any), nearest-first.
  const nearest: CqcLocation[] = CATEGORIES.map((c) => bestRated.get(c.key) ?? bestAny.get(c.key))
    .filter((b): b is { raw: RawCqc; d: number } => b !== undefined)
    .map(({ raw, d }) => ({
      name: raw.name,
      category: LABELS[raw.cat] ?? raw.cat,
      rating: normaliseRating(raw.rating),
      ratingDate: raw.date,
      distanceMiles: Math.round(d * 10) / 10,
      url: cqcLocationUrl(raw.id),
    }))
    .sort((a, b) => a.distanceMiles - b.distanceMiles);

  return { radiusMiles, total, rated, byRating, asAt: data.asAt, nearest };
}
