import { NextRequest, NextResponse } from "next/server";
import { fetchScotlandFlood } from "@/lib/scotlandFlood";

// SEPA flood-hazard likelihood (river / surface water / coastal) at a point - Scotland's analog to the
// EA flood route. Lazy-loaded by the Property-checks panel for Scottish areas.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }
  return NextResponse.json(await fetchScotlandFlood({ lat, lng }));
}
