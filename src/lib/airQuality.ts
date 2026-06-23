import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AirQualitySummary } from "./types";

// Modelled annual-mean background NO2 + PM2.5 at a point, from a COMMITTED Defra PCM dataset
// (build-air-quality.mjs) - read from disk at runtime (memoised, like amenities.ts/cqc.ts). No live
// call: the 1 km background maps are an annual snapshot, so they ship as committed JSON keyed by OS grid
// cell. Pairs with the noise panel. The join is the postcode's OSGB easting/northing (postcodes.io),
// snapped to the 1 km cell - so it's GB-only (Northern Ireland uses the Irish grid → no cell → null).

type Cell = [number | null, number | null]; // [no2, pm25] µg/m³
interface Grid {
  year: number;
  count: number;
  grid: Record<string, Cell>;
}

let cached: Grid | null | undefined;
function committed(): Grid | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src", "data", "air-quality-by-grid.json"), "utf8"),
    ) as Grid;
  } catch {
    cached = null; // dataset missing (shouldn't happen in a real deploy) → degrade, don't 500
  }
  return cached;
}

// 1 km cell key from an OSGB easting/northing — floor to the km (matches the ETL's keying of cell
// centres, e.g. centre 460500 → "460").
const cellKey = (easting: number, northing: number) =>
  `${Math.floor(easting / 1000)}_${Math.floor(northing / 1000)}`;

export function airQualityForPoint(easting?: number, northing?: number): AirQualitySummary | null {
  if (easting == null || northing == null || !Number.isFinite(easting) || !Number.isFinite(northing))
    return null;
  const data = committed();
  if (!data) return null;
  const cell = data.grid[cellKey(easting, northing)];
  if (!cell) return null; // outside the GB grid (e.g. Northern Ireland) → no air-quality panel
  return { no2: cell[0], pm25: cell[1], year: data.year };
}
