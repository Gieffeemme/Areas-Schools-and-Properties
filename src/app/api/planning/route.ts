import { NextRequest, NextResponse } from "next/server";
import { fetchPlanning } from "@/lib/planning";

// Planning applications near a point, via PlanIt (third-party aggregator of UK council planning
// registers). Lazy-loaded by the area panel so the main search stays fast. An empty result (no
// applications nearby) is a valid 200; only an actual lookup failure is a 502.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }
  const planning = await fetchPlanning({ lat, lng });
  if (!planning) {
    return NextResponse.json({ error: "Planning lookup failed" }, { status: 502 });
  }
  return NextResponse.json(planning);
}
