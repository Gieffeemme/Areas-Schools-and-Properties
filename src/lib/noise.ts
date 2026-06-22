import { LatLng, NoiseSource, NoiseSummary } from "./types";

// Environmental noise at a point, from Defra's strategic noise maps (Round 4 — a 2021 snapshot for
// England) served as GeoServer WMS rasters. Live point-query (no committed dataset), cached with the
// rest of the area report; the underlying maps are static (a 5-year cycle) so we let Next cache the
// upstream fetches hard. Defra's GeoServer wants a browser User-Agent.
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

const REVALIDATE = 60 * 60 * 24 * 30; // 30 days — Defra republishes on a 5-year cycle
const HALF_DEG = 0.0006; // ~50 m half-box around the point

// One WMS GetFeatureInfo against a raster layer → the modelled dB at the point, or null when the
// queried pixel is NoData. The maps are modelled on a 10 m grid with a lower cutoff of 40 dB (Lden)
// / 35 dB (Lnight), and GeoServer returns GRAY_INDEX 0 for anything below that — i.e. no significant
// source at this point. No valid modelled value falls between 0 and the cutoff, so >0 means real.
async function queryLayer(
  wms: string,
  layer: string,
  centre: LatLng,
  signal: AbortSignal,
): Promise<number | null> {
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
  const res = await fetch(`${wms}?${qs}`, {
    headers: { "User-Agent": UA },
    signal,
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`Defra noise WMS returned ${res.status}`);
  const data = (await res.json()) as {
    features?: { properties?: { GRAY_INDEX?: number } }[];
  };
  const v = data.features?.[0]?.properties?.GRAY_INDEX;
  return typeof v === "number" && v > 0 ? Math.round(v) : null;
}

export async function fetchNoise(centre: LatLng): Promise<NoiseSummary> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    // [roadLden, roadLnight, railLden, railLnight] — each fails independently.
    const settled = await Promise.allSettled(
      SOURCES.flatMap((s) => [
        queryLayer(s.wms, s.lden, centre, ctrl.signal),
        queryLayer(s.wms, s.lnight, centre, ctrl.signal),
      ]),
    );
    // A point genuinely below threshold returns 0 (→ null), which is a valid "quiet" result. Only a
    // wholesale outage (every call rejected) is an error worth surfacing.
    if (settled.every((r) => r.status === "rejected")) {
      throw new Error("Defra noise service is unavailable");
    }
    const val = (i: number) =>
      settled[i].status === "fulfilled"
        ? (settled[i] as PromiseFulfilledResult<number | null>).value
        : null;
    const road: NoiseSource = { lden: val(0), lnight: val(1) };
    const rail: NoiseSource = { lden: val(2), lnight: val(3) };
    return { road, rail, year: "2021" };
  } finally {
    clearTimeout(timer);
  }
}
