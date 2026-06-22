import { AmenityCategory, AmenitySummary, LatLng } from "./types";
import { distanceMiles } from "./distance";

// Everyday amenities near a point, from OpenStreetMap via the Overpass API. Live query (no committed
// dataset), cached with the rest of the area report. Overpass needs a real User-Agent.
const UA = "Locale/1.0 (area-intel; +https://github.com/Gieffeemme/Areas-Schools-and-Properties)";
const OVERPASS = "https://overpass-api.de/api/interpreter";
const RADIUS_MILES = 1; // fixed walkable radius, like the crime radius
const MILE_M = 1609.34;

// Display order + how each category is matched from OSM tags. `sel` is its Overpass selector.
const CATEGORIES: {
  key: string;
  label: string;
  sel: string;
  match: (t: Record<string, string>) => boolean;
}[] = [
  { key: "supermarket", label: "Supermarkets", sel: `nwr["shop"="supermarket"]`, match: (t) => t.shop === "supermarket" },
  { key: "convenience", label: "Convenience stores", sel: `nwr["shop"="convenience"]`, match: (t) => t.shop === "convenience" },
  { key: "gp", label: "GP surgeries", sel: `nwr["amenity"="doctors"]`, match: (t) => t.amenity === "doctors" },
  { key: "pharmacy", label: "Pharmacies", sel: `nwr["amenity"="pharmacy"]`, match: (t) => t.amenity === "pharmacy" },
  { key: "station", label: "Train/tram stations", sel: `nwr["railway"="station"]`, match: (t) => t.railway === "station" },
  { key: "bus_stop", label: "Bus stops", sel: `node["highway"="bus_stop"]`, match: (t) => t.highway === "bus_stop" },
  { key: "park", label: "Parks", sel: `nwr["leisure"="park"]`, match: (t) => t.leisure === "park" },
  { key: "gym", label: "Gyms", sel: `nwr["leisure"="fitness_centre"]`, match: (t) => t.leisure === "fitness_centre" },
  { key: "dining", label: "Cafés & restaurants", sel: `nwr["amenity"~"^(restaurant|cafe)$"]`, match: (t) => t.amenity === "restaurant" || t.amenity === "cafe" },
];

interface OverpassEl {
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

export async function fetchAmenities(centre: LatLng): Promise<AmenitySummary> {
  const r = Math.round(RADIUS_MILES * MILE_M);
  const q =
    `[out:json][timeout:25];(` +
    CATEGORIES.map((c) => `${c.sel}(around:${r},${centre.lat},${centre.lng});`).join("") +
    `);out center tags;`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 28000);
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

    const categories: AmenityCategory[] = CATEGORIES.map((c) => {
      let count = 0;
      let nearest: number | null = null;
      for (const e of els) {
        if (!c.match(e.tags ?? {})) continue;
        count++;
        const lat = e.lat ?? e.center?.lat;
        const lon = e.lon ?? e.center?.lon;
        if (lat == null || lon == null) continue;
        const d = distanceMiles(centre.lat, centre.lng, lat, lon);
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
  } finally {
    clearTimeout(timer);
  }
}
