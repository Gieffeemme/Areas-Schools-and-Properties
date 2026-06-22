import { NextRequest, NextResponse } from "next/server";

// Returns police.uk street-level crime as a GeoJSON FeatureCollection for the ~1-mile circle
// around a point - used to render the crime heatmap layer (no database needed).

interface PoliceCrime {
  category: string;
  location?: { latitude: string; longitude: string };
  month?: string;
}

async function fetchAt(lat: string, lng: string, date?: string): Promise<PoliceCrime[]> {
  const url =
    `https://data.police.uk/api/crimes-street/all-crime?lat=${lat}&lng=${lng}` +
    (date ? `&date=${date}` : "");
  const res = await fetch(url, { next: { revalidate: 86400 } });
  if (!res.ok) throw new Error(`police.uk returned ${res.status}`);
  const d = await res.json();
  return Array.isArray(d) ? d : [];
}

function recentMonths(count: number, skip = 2): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - skip);
  for (let i = 0; i < count; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  if (!lat || !lng) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }

  try {
    let crimes = await fetchAt(lat, lng);
    if (crimes.length === 0) {
      for (const m of recentMonths(4)) {
        crimes = await fetchAt(lat, lng, m);
        if (crimes.length) break;
      }
    }
    const features = crimes
      .filter((c) => c.location)
      .map((c) => ({
        type: "Feature" as const,
        geometry: {
          type: "Point" as const,
          coordinates: [Number(c.location!.longitude), Number(c.location!.latitude)],
        },
        properties: { category: c.category },
      }));
    return NextResponse.json({ type: "FeatureCollection", features });
  } catch (e) {
    const message = e instanceof Error ? e.message : "police.uk request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
