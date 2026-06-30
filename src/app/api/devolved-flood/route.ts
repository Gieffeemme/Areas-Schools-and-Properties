import { NextRequest, NextResponse } from "next/server";
import { fetchDevolvedFlood } from "@/lib/devolvedFlood";

// Flood-hazard likelihood (river / coastal / surface water) at a point for the devolved nations -
// Scotland (SEPA) + Wales (NRW). NI (DfI) isn't openly queryable, so it's not supported here; England
// uses the separate /api/flood (EA flood areas). Lazy-loaded by the Property-checks panel, gated on nation.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  const nation = searchParams.get("nation") ?? "";
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }
  return NextResponse.json(await fetchDevolvedFlood(nation, { lat, lng }));
}
