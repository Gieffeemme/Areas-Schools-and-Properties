import { LatLng, DevolvedFloodSummary, FloodLikelihood } from "./types";

// Flood-RISK point-query for the devolved nations (England uses EA flood AREAS — see flood.ts). Each
// agency publishes river / sea / surface-water hazard at high/medium/low likelihood; we keep the
// highest band per source. Live, fail-soft to null. Dispatch by nation.

const RANK: Record<FloodLikelihood, number> = { high: 3, medium: 2, low: 1 };
const bump = (out: DevolvedFloodSummary, src: keyof DevolvedFloodSummary, lik: FloodLikelihood | null) => {
  if (lik && (!out[src] || RANK[lik] > RANK[out[src]!])) out[src] = lik;
};
const empty = (): DevolvedFloodSummary => ({ river: null, surfaceWater: null, coastal: null });
const likelihood = (v?: string): FloodLikelihood | null => {
  const s = String(v ?? "").toLowerCase();
  return s.includes("high") ? "high" : s.includes("medium") ? "medium" : s.includes("low") ? "low" : null;
};

// NI is intentionally absent: DfI's Flood Maps NI aren't published as an open queryable service (the
// open-data route is a manual data *request*, and the ArcGIS layers are secured) — unlike SEPA/NRW.
export async function fetchDevolvedFlood(nation: string, centre: LatLng): Promise<DevolvedFloodSummary | null> {
  if (nation === "Scotland") return fetchScotlandFlood(centre);
  if (nation === "Wales") return fetchWalesFlood(centre);
  return null;
}

// --- Scotland: SEPA, one ArcGIS `identify` over all 9 source×likelihood layers ---
const SEPA_IDENTIFY = "https://map.sepa.org.uk/server/rest/services/Open/Flood_Maps/MapServer/identify";
const SEPA_LAYERS: Record<number, [keyof DevolvedFloodSummary, FloodLikelihood]> = {
  0: ["river", "high"], 1: ["river", "medium"], 2: ["river", "low"],
  3: ["surfaceWater", "high"], 4: ["surfaceWater", "medium"], 5: ["surfaceWater", "low"],
  6: ["coastal", "high"], 7: ["coastal", "medium"], 8: ["coastal", "low"],
};
async function fetchScotlandFlood(centre: LatLng): Promise<DevolvedFloodSummary | null> {
  const d = 0.002;
  const qs = new URLSearchParams({
    geometry: `${centre.lng},${centre.lat}`, geometryType: "esriGeometryPoint", sr: "4326", tolerance: "2",
    mapExtent: [centre.lng - d, centre.lat - d, centre.lng + d, centre.lat + d].join(","),
    imageDisplay: "400,400,96", layers: "all:0,1,2,3,4,5,6,7,8", returnGeometry: "false", f: "json",
  });
  try {
    const res = await fetch(`${SEPA_IDENTIFY}?${qs}`, { signal: AbortSignal.timeout(7000), next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const j = (await res.json()) as { results?: { layerId: number }[] };
    const out = empty();
    for (const r of j.results ?? []) {
      const m = SEPA_LAYERS[r.layerId];
      if (m) bump(out, m[0], m[1]);
    }
    return out;
  } catch {
    return null;
  }
}

// --- Wales: NRW (DataMapWales GeoServer), one WMS GetFeatureInfo per source layer, `risk` attribute ---
const NRW_WMS = "https://datamap.gov.wales/geoserver/inspire-nrw/ows";
const NRW_LAYERS: [keyof DevolvedFloodSummary, string][] = [
  ["river", "inspire-nrw:NRW_FLOOD_RISK_FROM_RIVERS"],
  ["coastal", "inspire-nrw:NRW_FLOOD_RISK_FROM_SEA"],
  ["surfaceWater", "inspire-nrw:NRW_FLOOD_RISK_FROM_SURFACE_WATER_SMALL_WATERCOURSES"],
];
async function nrwLayerRisk(layer: string, centre: LatLng, signal: AbortSignal): Promise<FloodLikelihood | null> {
  const d = 0.0008;
  const qs = new URLSearchParams({
    service: "WMS", version: "1.1.1", request: "GetFeatureInfo", layers: layer, query_layers: layer,
    srs: "EPSG:4326", bbox: [centre.lng - d, centre.lat - d, centre.lng + d, centre.lat + d].join(","),
    width: "101", height: "101", x: "50", y: "50", info_format: "application/json", feature_count: "1",
  });
  try {
    const res = await fetch(`${NRW_WMS}?${qs}`, { signal, next: { revalidate: 86400 } });
    if (!res.ok) return null;
    const j = (await res.json()) as { features?: { properties?: { risk?: string } }[] };
    return likelihood(j.features?.[0]?.properties?.risk);
  } catch {
    return null;
  }
}
async function fetchWalesFlood(centre: LatLng): Promise<DevolvedFloodSummary | null> {
  const signal = AbortSignal.timeout(8000);
  const results = await Promise.allSettled(NRW_LAYERS.map(([, layer]) => nrwLayerRisk(layer, centre, signal)));
  if (results.every((r) => r.status === "rejected")) return null;
  const out = empty();
  results.forEach((r, i) => {
    if (r.status === "fulfilled") bump(out, NRW_LAYERS[i][0], r.value);
  });
  return out;
}
