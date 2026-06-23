import { NextRequest, NextResponse } from "next/server";
import { fetchAddresses } from "@/lib/epc";

// Specific addresses at a postcode, for the property picker (EPC register). Server-side so the
// EPC Bearer token stays out of the browser. Best-effort: returns [] on failure.
export async function GET(req: NextRequest) {
  const postcode = req.nextUrl.searchParams.get("postcode") ?? "";
  try {
    return NextResponse.json(await fetchAddresses(postcode));
  } catch {
    return NextResponse.json([]);
  }
}
