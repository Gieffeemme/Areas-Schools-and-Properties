import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EvCharger, EvChargingSummary, LatLng } from "./types";
import { distanceMiles } from "./distance";

// Public EV charging near a point, from a COMMITTED OSM dataset (build-ev-charging.mjs) - read from disk
// at runtime (memoised, like amenities.ts). No per-request Overpass call. The official National
// Chargepoint Registry was decommissioned (Nov 2024), so OSM is the practical free national source; we
// keep location, operator and capacity (number of charge points) - connector/power are too sparsely
// tagged. For the point: count of charging locations within ~1 mile + the nearest few.
const RADIUS_MILES = 1; // walkable, matching the amenities panel
const DLAT = 0.02; // bbox guard, a bit over 1 mile at UK latitudes
const DLNG = 0.03;

interface RawSite {
  lat: number;
  lng: number;
  op?: string; // operator / network / name
  cap?: number; // capacity (charge points)
}

let cached: RawSite[] | null | undefined;
function committed(): RawSite[] | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src", "data", "ev-charging.json"), "utf8"),
    ) as RawSite[];
  } catch {
    cached = null; // dataset missing (shouldn't happen in a real deploy) → degrade, don't 500
  }
  return cached;
}

export function nearbyEvCharging(centre: LatLng, radiusMiles = RADIUS_MILES): EvChargingSummary | null {
  const sites = committed();
  if (sites === null) return null;
  const within: EvCharger[] = [];
  for (const s of sites) {
    if (Math.abs(s.lat - centre.lat) > DLAT || Math.abs(s.lng - centre.lng) > DLNG) continue;
    const d = distanceMiles(centre.lat, centre.lng, s.lat, s.lng);
    if (d > radiusMiles) continue;
    within.push({
      operator: s.op ?? "",
      capacity: typeof s.cap === "number" ? s.cap : null,
      distanceMiles: Math.round(d * 100) / 100,
    });
  }
  within.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return { radiusMiles, count: within.length, nearest: within.slice(0, 5) };
}
