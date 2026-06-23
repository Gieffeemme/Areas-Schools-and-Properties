import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BathingWaterSummary, LatLng } from "./types";
import { distanceMiles } from "./distance";

// Nearest designated bathing water to a point, from a COMMITTED Environment Agency dataset
// (build-bathing-water.mjs) - read at runtime (memoised). The set is small (~460) and static-ish
// (classifications are annual), so it ships as committed JSON. Only surfaced when one is within a
// coastal threshold, so the panel appears for seaside/lakeside areas and is hidden inland.
const MAX_MILES = 10;

interface RawWater {
  name: string;
  lat: number;
  lng: number;
  cls: string; // Excellent | Good | Sufficient | Poor | Closed | ""
}

let cached: RawWater[] | null | undefined;
function committed(): RawWater[] | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src", "data", "bathing-waters.json"), "utf8"),
    ) as RawWater[];
  } catch {
    cached = null;
  }
  return cached;
}

export function nearestBathingWater(centre: LatLng, maxMiles = MAX_MILES): BathingWaterSummary | null {
  const list = committed();
  if (!list) return null;
  let best: { w: RawWater; d: number } | null = null;
  for (const w of list) {
    if (w.cls === "Closed") continue; // de-designated / closed → not useful to surface
    const d = distanceMiles(centre.lat, centre.lng, w.lat, w.lng);
    if (best === null || d < best.d) best = { w, d };
  }
  if (!best || best.d > maxMiles) return null; // nothing nearby → hide the panel (inland)
  return {
    name: best.w.name,
    classification: best.w.cls || null, // "" (newly designated) → null = "not yet classified"
    distanceMiles: Math.round(best.d * 10) / 10,
  };
}
