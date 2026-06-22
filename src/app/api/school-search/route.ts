import { NextRequest, NextResponse } from "next/server";
import { searchSchools } from "@/lib/schools";

// Name search over the GIAS + Early Years registers (in-memory; no external call). Powers the
// search box's "type a school name" mode.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  return NextResponse.json({ results: searchSchools(q) });
}
