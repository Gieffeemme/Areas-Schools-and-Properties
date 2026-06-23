import { NextRequest, NextResponse } from "next/server";
import { fetchPlanningConstraints } from "@/lib/planningConstraints";

// Planning constraints at a point (designations + nearby listed buildings), via planning.data.gov.uk -
// a live spatial query. Lazy-loaded by the area Property-checks row so the main search stays fast. A
// location with no designations is a valid 200 (empty arrays); only an actual lookup failure is a 502.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }
  const constraints = await fetchPlanningConstraints({ lat, lng });
  if (!constraints) {
    return NextResponse.json({ error: "Planning constraints lookup failed" }, { status: 502 });
  }
  return NextResponse.json(constraints);
}
