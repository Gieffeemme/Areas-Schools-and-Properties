import { NextRequest, NextResponse } from "next/server";
import { nearbyCqc } from "@/lib/cqc";

// CQC-rated health & care services near a point, from the committed CQC directory (build-cqc.mjs) - a
// disk read, no live API. Lazy-loaded by the property/area checks so the main search stays fast. An area
// with nothing nearby is a valid 200 (total: 0); null only means the dataset file is missing (a deploy
// bug), which is a 502.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }
  // Only honour an explicit radius; absent param → let nearbyCqc use its default (Number(null) is 0, so
  // guard on the raw string, not the coerced number).
  const radiusParam = searchParams.get("radius");
  const radius = radiusParam ? Number(radiusParam) : NaN;
  const cqc = nearbyCqc(
    { lat, lng },
    Number.isFinite(radius) ? Math.min(5, Math.max(0.25, radius)) : undefined,
  );
  if (!cqc) {
    return NextResponse.json({ error: "CQC dataset unavailable" }, { status: 502 });
  }
  return NextResponse.json(cqc);
}
