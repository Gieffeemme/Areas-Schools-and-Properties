import { NextRequest, NextResponse } from "next/server";
import { searchPlaces } from "@/lib/geocode";

// Town / city / suburb / borough name suggestions for the search box (postcodes.io Places). Sits
// alongside /api/school-search so the box can resolve a place when the postcode isn't known.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json({ results: await searchPlaces(q) });
}
