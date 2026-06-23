import { LatLng, TransportStation, TransportSummary } from "./types";
import { distanceMiles } from "./distance";

// Nearest rail / metro / tram stations to a point, from OpenStreetMap via the Overpass API. This is a
// *connectivity* signal (the named nearest station, however far) — distinct from the amenities panel's
// walkable density count (stations within 1 mile). Live query, no committed dataset; Overpass needs a
// real User-Agent (same as amenities.ts). Straight-line distance, not routed — door-to-door commute
// times would need a paid routing API, deliberately out of scope.
const UA = "Locale/1.0 (area-intel; +https://github.com/Gieffeemme/Areas-Schools-and-Properties)";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const MILE_M = 1609.34;
const SEARCH_MILES = 5; // how far to look for a station (not a walkable cap — just the nearest, named)
const MAX_STATIONS = 3;

interface OverpassEl {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

// Classify a station from its OSM tags. London Underground / Glasgow Subway carry station=subway;
// DLR / Tyne & Wear Metro carry light_rail; trams are tram_stop; everything else is heavy rail.
function classify(t: Record<string, string>): TransportStation["kind"] {
  if (t.railway === "tram_stop" || t.station === "tram") return "tram";
  if (t.station === "subway" || t.subway === "yes") return "metro";
  if (t.station === "light_rail" || t.light_rail === "yes") return "light_rail";
  return "rail";
}

const FALLBACK_NAME: Record<TransportStation["kind"], string> = {
  rail: "Railway station",
  metro: "Metro station",
  light_rail: "Light-rail station",
  tram: "Tram stop",
};

export async function fetchTransport(centre: LatLng): Promise<TransportSummary> {
  const r = Math.round(SEARCH_MILES * MILE_M);
  const around = `(around:${r},${centre.lat},${centre.lng})`;
  const q =
    `[out:json][timeout:25];(` +
    `nwr["railway"="station"]${around};` +
    `nwr["railway"="halt"]${around};` +
    `nwr["railway"="tram_stop"]${around};` +
    `);out center tags;`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(OVERPASS, {
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "text/plain" },
      body: q,
      signal: ctrl.signal,
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`Overpass returned ${res.status}`);
    const data = (await res.json()) as { elements?: OverpassEl[] };
    const els = data.elements ?? [];

    // Dedupe multi-platform nodes (same station mapped several times) by name+kind, keeping the nearest.
    const seen = new Map<string, TransportStation>();
    for (const e of els) {
      const tags = e.tags ?? {};
      const lat = e.lat ?? e.center?.lat;
      const lon = e.lon ?? e.center?.lon;
      if (lat == null || lon == null) continue;
      const kind = classify(tags);
      const name = (tags.name ?? "").trim() || FALLBACK_NAME[kind];
      const d = distanceMiles(centre.lat, centre.lng, lat, lon);
      const key = `${name.toLowerCase()}|${kind}`;
      const prev = seen.get(key);
      if (!prev || d < prev.distanceMiles) {
        seen.set(key, { name, kind, distanceMiles: Math.round(d * 100) / 100, lat, lng: lon });
      }
    }

    const stations = [...seen.values()]
      .sort((a, b) => a.distanceMiles - b.distanceMiles)
      .slice(0, MAX_STATIONS);
    return { stations, searchRadiusMiles: SEARCH_MILES };
  } finally {
    clearTimeout(timer);
  }
}
