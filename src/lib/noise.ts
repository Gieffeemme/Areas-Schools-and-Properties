import { LatLng, NoiseSource, NoiseSummary } from "./types";

// Environmental noise at a point, from Defra's strategic noise maps (Round 4 — a 2021 snapshot for
// England) served as GeoServer WMS rasters. Live point-query (no committed dataset); the assembled
// area report is what gets cached (Upstash, 6 h). We deliberately DON'T cache the individual WMS
// reads (`no-store`): a definitive reading and a transient empty response are both HTTP 200, so
// caching would risk freezing a spurious gap, and a same-URL retry would just re-read it. Defra's
// GeoServer wants a browser User-Agent.
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

// Road and rail Round 4 layers live in different GeoServer workspaces.
const SOURCES = [
  {
    wms: "https://environment.data.gov.uk/spatialdata/road-noise-all-metrics-england-round-4/wms",
    lden: "Road_Noise_Lden_England_Round_4_All",
    lnight: "Road_Noise_Lnight_England_Round_4_All",
  },
  {
    wms: "https://environment.data.gov.uk/spatialdata/noise-data/wms",
    lden: "Rail_Noise_Lden_England_Round_4_All",
    lnight: "Rail_Noise_Lnight_England_Round_4_All",
  },
] as const;

const HALF_DEG = 0.0006; // ~50 m half-box around the point

function infoUrl(wms: string, layer: string, centre: LatLng): string {
  // CRS:84 keeps coordinates in lon,lat order, sidestepping the WMS 1.3.0 EPSG:4326 axis-order trap.
  const bbox = [
    centre.lng - HALF_DEG,
    centre.lat - HALF_DEG,
    centre.lng + HALF_DEG,
    centre.lat + HALF_DEG,
  ].join(",");
  const qs = new URLSearchParams({
    service: "WMS",
    version: "1.3.0",
    request: "GetFeatureInfo",
    layers: layer,
    query_layers: layer,
    crs: "CRS:84",
    bbox,
    width: "11",
    height: "11",
    i: "5",
    j: "5",
    info_format: "application/json",
    feature_count: "1",
  });
  return `${wms}?${qs}`;
}

// One WMS GetFeatureInfo read. We only ever query England (fetchNoise's caller gates on it), where
// every covered point returns a feature: a positive GRAY_INDEX is the modelled dB; 0 or a negative
// sentinel means "no modelled noise here". So:
//   number > 0  → modelled dB at the point
//   null        → 0 / negative sentinel = genuinely no modelled noise at this point
//   undefined   → the read yielded no value — network/HTTP/JSON error, OR an empty/absent feature.
//                 Inside England an empty collection is a transient server blip (rural England still
//                 returns a 0 feature), never real "quiet", so the caller retries (see queryLayer);
//                 an all-undefined result is surfaced as a service outage, not a silent quiet area.
async function readPixel(url: string, signal: AbortSignal): Promise<number | null | undefined> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA }, signal, cache: "no-store" });
  } catch {
    return undefined;
  }
  if (!res.ok) return undefined;
  let data: { features?: { properties?: { GRAY_INDEX?: number } }[] };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return undefined;
  }
  const feats = data.features ?? [];
  if (feats.length === 0) return undefined; // transient blip within England → retry
  const v = feats[0]?.properties?.GRAY_INDEX;
  if (typeof v !== "number") return undefined;
  return v > 0 ? Math.round(v) : null;
}

// Resolves to number | null (both definitive) or undefined when every attempt failed — the caller
// distinguishes a single failed metric from a wholesale outage. Never rejects. Up to 3 attempts to
// ride out a transient empty/blip; readPixel uses no-store, so each attempt re-hits the origin, and
// an aborted (timed-out) signal makes the remaining attempts fail fast rather than hang.
async function queryLayer(
  wms: string,
  layer: string,
  centre: LatLng,
  signal: AbortSignal,
): Promise<number | null | undefined> {
  const url = infoUrl(wms, layer, centre);
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await readPixel(url, signal);
    if (r !== undefined) return r; // definitive number or null
  }
  return undefined;
}

export async function fetchNoise(centre: LatLng): Promise<NoiseSummary> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    // [roadLden, roadLnight, railLden, railLnight] — queryLayer never rejects.
    const results = await Promise.all(
      SOURCES.flatMap((s) => [
        queryLayer(s.wms, s.lden, centre, ctrl.signal),
        queryLayer(s.wms, s.lnight, centre, ctrl.signal),
      ]),
    );
    // A point below threshold returns null, a valid "quiet" result. Only a wholesale outage (every
    // read failed → all undefined) is an error worth surfacing as "noise temporarily unavailable".
    if (results.every((r) => r === undefined)) {
      throw new Error("Defra noise service is unavailable");
    }
    const v = (i: number) => results[i] ?? null; // undefined (failed) or null → null
    const road: NoiseSource = { lden: v(0), lnight: v(1) };
    const rail: NoiseSource = { lden: v(2), lnight: v(3) };
    return { road, rail, year: "2021" };
  } finally {
    clearTimeout(timer);
  }
}
