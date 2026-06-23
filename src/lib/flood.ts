import { FloodSummary, LatLng } from "./types";

const FM = "https://environment.data.gov.uk/flood-monitoring";

interface AreaItem {
  notation: string;
  description: string;
  riverOrSea?: string;
  polygon: string;
  lat?: number;
  long?: number;
}

/**
 * Environment Agency flood-risk signal for a point: which designated flood area (if any) actually
 * contains it - by point-in-polygon, not just proximity - plus any warnings in force nearby.
 * Free, key-free flood-monitoring API.
 */
export async function fetchFlood(centre: LatLng): Promise<FloodSummary> {
  const list = await getJson(`${FM}/id/floodAreas?lat=${centre.lat}&long=${centre.lng}&dist=3`);
  const candidates = ((list.items ?? []) as AreaItem[])
    .filter((a) => a.polygon)
    .sort((a, b) => near(centre, a) - near(centre, b))
    .slice(0, 6); // nearest few - enough to cover the point without fetching every polygon

  const containing = (
    await Promise.all(
      candidates.map(async (a) => {
        try {
          const poly = await getJson(a.polygon);
          const geom = poly?.features?.[0]?.geometry ?? poly?.geometry;
          return geom && pointInGeometry(centre.lng, centre.lat, geom) ? a : null;
        } catch {
          return null; // a single unreadable polygon shouldn't sink the check
        }
      }),
    )
  ).filter((a): a is AreaItem => a !== null);

  const warning = containing.find((a) => isWarningArea(a.notation));
  const alert = containing.find((a) => !isWarningArea(a.notation));
  const chosen = warning ?? alert;
  const status: FloodSummary["status"] = warning ? "warning-area" : alert ? "alert-area" : "clear";

  // Warnings/alerts currently in force near the point (severityLevel 1-3 are active; 4 = stood down).
  let activeWarnings = 0;
  let topSeverity: string | undefined;
  try {
    const floods = await getJson(`${FM}/id/floods?lat=${centre.lat}&long=${centre.lng}&dist=5`);
    const active = ((floods.items ?? []) as { severity?: string; severityLevel?: number }[])
      .filter((x) => (x.severityLevel ?? 4) <= 3)
      .sort((a, b) => (a.severityLevel ?? 4) - (b.severityLevel ?? 4));
    activeWarnings = active.length;
    topSeverity = active[0]?.severity;
  } catch {
    /* current-warning lookup is best-effort */
  }

  return {
    status,
    areaName: chosen?.description,
    riverOrSea: chosen?.riverOrSea,
    activeWarnings,
    topSeverity,
  };
}

async function getJson(url: string) {
  const res = await fetch(url, { next: { revalidate: 21600 } });
  if (!res.ok) throw new Error(`Environment Agency returned ${res.status}`);
  return res.json();
}

// EA flood-area codes encode the type: Flood Warning Areas contain "FW" (e.g. 061FWF23Staines),
// Flood Alert Areas contain "WA" (e.g. 061WAF23Datchet).
const isWarningArea = (notation: string) => /FW/i.test(notation);

function near(c: LatLng, a: AreaItem): number {
  const dlat = (a.lat ?? c.lat) - c.lat;
  const dlng = (a.long ?? c.lng) - c.lng;
  return dlat * dlat + dlng * dlng;
}

type Geometry = { type: string; coordinates: number[][][] | number[][][][] };

function pointInGeometry(lng: number, lat: number, geom: Geometry): boolean {
  const polys: number[][][][] =
    geom.type === "MultiPolygon"
      ? (geom.coordinates as number[][][][])
      : geom.type === "Polygon"
        ? [geom.coordinates as number[][][]]
        : [];
  for (const poly of polys) {
    if (poly[0] && pointInRing(lng, lat, poly[0])) {
      let inHole = false;
      for (let h = 1; h < poly.length; h++) {
        if (pointInRing(lng, lat, poly[h])) {
          inHole = true;
          break;
        }
      }
      if (!inHole) return true;
    }
  }
  return false;
}

// Ray-casting point-in-ring.
function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}
