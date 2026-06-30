import { LatLng, ScotlandFloodSummary, FloodLikelihood } from "./types";

// SEPA flood-hazard maps (OGL) as one ArcGIS MapServer with a layer per source × likelihood. England's
// EA flood feature is warning/alert AREAS; Scotland has no equivalent, so this is the flood-RISK model:
// a single `identify` at the point returns every flood extent it falls in; we keep the highest
// likelihood per source. police.uk-style live point-query — fail-soft to null.
const IDENTIFY = "https://map.sepa.org.uk/server/rest/services/Open/Flood_Maps/MapServer/identify";
const LAYERS: Record<number, [keyof ScotlandFloodSummary, FloodLikelihood]> = {
  0: ["river", "high"], 1: ["river", "medium"], 2: ["river", "low"],
  3: ["surfaceWater", "high"], 4: ["surfaceWater", "medium"], 5: ["surfaceWater", "low"],
  6: ["coastal", "high"], 7: ["coastal", "medium"], 8: ["coastal", "low"],
};
const RANK: Record<FloodLikelihood, number> = { high: 3, medium: 2, low: 1 };

export async function fetchScotlandFlood(centre: LatLng): Promise<ScotlandFloodSummary | null> {
  const d = 0.002;
  const qs = new URLSearchParams({
    geometry: `${centre.lng},${centre.lat}`,
    geometryType: "esriGeometryPoint",
    sr: "4326",
    tolerance: "2",
    mapExtent: [centre.lng - d, centre.lat - d, centre.lng + d, centre.lat + d].join(","),
    imageDisplay: "400,400,96",
    layers: "all:0,1,2,3,4,5,6,7,8", // skip 9-11 (future/climate-change projections)
    returnGeometry: "false",
    f: "json",
  });
  try {
    const res = await fetch(`${IDENTIFY}?${qs}`, {
      signal: AbortSignal.timeout(7000),
      next: { revalidate: 86400 }, // SEPA hazard maps are near-static
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: { layerId: number }[] };
    const out: ScotlandFloodSummary = { river: null, surfaceWater: null, coastal: null };
    for (const r of j.results ?? []) {
      const m = LAYERS[r.layerId];
      if (!m) continue;
      const [src, lik] = m;
      const cur = out[src];
      if (!cur || RANK[lik] > RANK[cur]) out[src] = lik;
    }
    return out;
  } catch {
    return null; // upstream down / timeout — the panel shows "temporarily unavailable"
  }
}
