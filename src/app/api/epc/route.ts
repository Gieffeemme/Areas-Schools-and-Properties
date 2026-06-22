import { NextRequest, NextResponse } from "next/server";
import { fetchEpc } from "@/lib/epc";

// Domestic EPC summary for a postcode (MHCLG). Server-side so the Bearer token (EPC_API_KEY) stays
// out of the browser. Best-effort: returns null on failure so the property panel degrades gracefully.
export async function GET(req: NextRequest) {
  const postcode = req.nextUrl.searchParams.get("postcode") ?? "";
  try {
    return NextResponse.json(await fetchEpc(postcode));
  } catch {
    return NextResponse.json(null);
  }
}
