import { NextRequest, NextResponse } from "next/server";
import { fetchSchoolsByIds } from "@/lib/schools";

// Full enriched School objects for specific ids ("gias/{urn}" | "ey/{urn}"), powering the school
// comparison view. In-memory (committed datasets); no external call.
export async function GET(req: NextRequest) {
  const ids = (req.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);
  if (!ids.length) {
    return NextResponse.json({ error: "ids required" }, { status: 400 });
  }
  return NextResponse.json({ schools: fetchSchoolsByIds(ids) });
}
