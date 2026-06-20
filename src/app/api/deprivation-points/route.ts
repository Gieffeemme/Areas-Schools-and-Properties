import { NextRequest, NextResponse } from "next/server";

// Returns a deprivation (IMD) surface as a GeoJSON FeatureCollection for the area around a point.
// We sample a grid of locations inside the search radius and reverse-geocode them in ONE bulk call
// to postcodes.io, tagging each with its LSOA's English IMD 2019 decile (1 = most deprived).
// No bundled dataset or LSOA boundaries needed — the same live source the area lookup already uses.

const ENGLAND_LSOA_COUNT = 32844; // matches the decile derivation in lib/geocode.ts

interface RevGeo {
  query: { longitude: number; latitude: number };
  result: { country?: string; index_of_multiple_deprivation?: number }[] | null;
}

// A square grid clipped to the search circle. 11×11 ≈ 95 points inside the circle, just under
// postcodes.io's 100-geolocation bulk cap, so the whole area is one request.
function sampleGrid(lat: number, lng: number, radiusMiles: number) {
  const km = radiusMiles * 1.60934;
  const dLat = km / 110.574;
  const dLng = km / (111.32 * Math.cos((lat * Math.PI) / 180));
  const N = 11;
  const pts: { longitude: number; latitude: number; radius: number; limit: number }[] = [];
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const fx = (i / (N - 1)) * 2 - 1; // -1..1
      const fy = (j / (N - 1)) * 2 - 1;
      if (fx * fx + fy * fy > 1) continue; // keep points inside the circle
      pts.push({ longitude: lng + fx * dLng, latitude: lat + fy * dLat, radius: 700, limit: 1 });
    }
  }
  return pts.slice(0, 100);
}

const decileFromRank = (rank: number): number =>
  Math.min(10, Math.max(1, Math.ceil((rank / ENGLAND_LSOA_COUNT) * 10)));

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const radiusMiles = Math.min(3, Math.max(0.25, Number(searchParams.get("radius") ?? "1")));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  try {
    const res = await fetch("https://api.postcodes.io/postcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ geolocations: sampleGrid(lat, lng, radiusMiles) }),
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`postcodes.io returned ${res.status}`);
    const json = (await res.json()) as { result?: RevGeo[] };

    const features = (json.result ?? [])
      .map((g) => {
        const r = g.result?.[0];
        const rank = r?.index_of_multiple_deprivation;
        // English IMD only — postcodes.io exposes no comparable rank for the other nations.
        if (!r || r.country !== "England" || typeof rank !== "number") return null;
        return {
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [g.query.longitude, g.query.latitude] },
          properties: { decile: decileFromRank(rank), rank },
        };
      })
      .filter((f): f is NonNullable<typeof f> => f !== null);

    return NextResponse.json({ type: "FeatureCollection", features });
  } catch (e) {
    const message = e instanceof Error ? e.message : "postcodes.io request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
