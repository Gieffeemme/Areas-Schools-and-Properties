import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LatLng, TransportStation, TransportSummary } from "./types";
import { distanceMiles } from "./distance";

// Nearest rail / metro / tram stations to a point, from the committed UK stations dataset
// (build-stations.mjs, sourced once from OSM at build time). A *connectivity* signal — the named
// nearest station, however far — distinct from the amenities walkable density count (stations within
// 1 mile). Read from disk at runtime (memoised, like imd.ts), so there's NO per-request Overpass call:
// instant and rate-limit-free. Straight-line distance, not routed — door-to-door commute times would
// need a paid routing API, deliberately out of scope.
const SEARCH_MILES = 5; // how far to look for a station (a connectivity radius, not a walkable cap)
const MAX_STATIONS = 3;

interface Station {
  name: string;
  kind: TransportStation["kind"];
  lat: number;
  lng: number;
}

let cached: Station[] | null | undefined;
function all(): Station[] | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src", "data", "stations.json"), "utf8"),
    ) as Station[];
  } catch {
    cached = null; // dataset missing (shouldn't happen in a real deploy) → degrade, don't 500
  }
  return cached;
}

export function nearestStations(centre: LatLng): TransportSummary | null {
  const data = all();
  if (!data) return null;
  // Dedupe any residual same-station duplicates by name+kind, keeping the nearest within the radius.
  const seen = new Map<string, TransportStation>();
  for (const s of data) {
    const d = distanceMiles(centre.lat, centre.lng, s.lat, s.lng);
    if (d > SEARCH_MILES) continue;
    const key = `${s.name.toLowerCase()}|${s.kind}`;
    const prev = seen.get(key);
    if (!prev || d < prev.distanceMiles) {
      seen.set(key, {
        name: s.name,
        kind: s.kind,
        distanceMiles: Math.round(d * 100) / 100,
        lat: s.lat,
        lng: s.lng,
      });
    }
  }
  const stations = [...seen.values()]
    .sort((a, b) => a.distanceMiles - b.distanceMiles)
    .slice(0, MAX_STATIONS);
  return { stations, searchRadiusMiles: SEARCH_MILES };
}

// The raw committed stations, for the amenities "station" count — so stations.json stays the single
// source of truth for stations. Empty array if the dataset file is missing.
export function stationsData(): Station[] {
  return all() ?? [];
}
