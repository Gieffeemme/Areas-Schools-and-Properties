import { NextRequest, NextResponse } from "next/server";
import { fetchFlood } from "@/lib/flood";

// Environment Agency flood-risk for a point: does a designated flood area contain it, plus any
// warnings in force now. Lazy-loaded by the property route so the main search stays fast.
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng required" }, { status: 400 });
  }
  try {
    return NextResponse.json(await fetchFlood({ lat, lng }));
  } catch (e) {
    const message = e instanceof Error ? e.message : "Environment Agency request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
