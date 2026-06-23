import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AmenityCategory, AmenitySummary, LatLng } from "./types";
import { distanceMiles } from "./distance";
import { stationsData } from "./transport";

// Everyday amenities near a point, from a COMMITTED OSM dataset (build-amenities.mjs) plus the committed
// stations dataset - read from disk at runtime (memoised, like imd.ts). NO per-request Overpass call, so
// it's instant and rate-limit-free. For each category: the count within ~1 mile + the nearest one.
// (Bus stops are intentionally not committed - ~370k nationally, low signal; rail/metro/tram is the
// Transport panel. The "station" count reuses stations.json so there's one source of truth for stations.)
const RADIUS_MILES = 1; // fixed walkable radius
// Cheap bounding-box guard (a bit over 1 mile at UK latitudes) to skip the haversine for far-away
// points while scanning the national arrays.
const DLAT = 0.02;
const DLNG = 0.03;

// Display order + label. These keys live in amenities.json, except "station" which comes from stations.json.
const CATEGORIES: { key: string; label: string }[] = [
  { key: "supermarket", label: "Supermarkets" },
  { key: "convenience", label: "Convenience stores" },
  { key: "gp", label: "GP surgeries" },
  { key: "pharmacy", label: "Pharmacies" },
  { key: "station", label: "Train/tram stations" },
  { key: "park", label: "Parks" },
  { key: "gym", label: "Gyms" },
  { key: "dining", label: "Cafés & restaurants" },
];

type Pt = [number, number]; // [lat, lng]
let cached: Record<string, Pt[]> | null | undefined;
function committed(): Record<string, Pt[]> | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src", "data", "amenities.json"), "utf8"),
    ) as Record<string, Pt[]>;
  } catch {
    cached = null; // dataset missing (shouldn't happen in a real deploy) → degrade, don't 500
  }
  return cached;
}

function pointsFor(key: string, data: Record<string, Pt[]>): Pt[] {
  if (key === "station") return stationsData().map((s) => [s.lat, s.lng] as Pt);
  return data[key] ?? [];
}

export function nearbyAmenities(centre: LatLng): AmenitySummary | null {
  const data = committed();
  if (data === null) return null;
  const categories: AmenityCategory[] = CATEGORIES.map((c) => {
    let count = 0;
    let nearest: number | null = null;
    for (const [lat, lng] of pointsFor(c.key, data)) {
      if (Math.abs(lat - centre.lat) > DLAT || Math.abs(lng - centre.lng) > DLNG) continue;
      const d = distanceMiles(centre.lat, centre.lng, lat, lng);
      if (d > RADIUS_MILES) continue;
      count++;
      if (nearest == null || d < nearest) nearest = d;
    }
    return {
      key: c.key,
      label: c.label,
      count,
      nearestMiles: nearest == null ? null : Math.round(nearest * 10) / 10,
    };
  });
  return { radiusMiles: RADIUS_MILES, categories };
}
