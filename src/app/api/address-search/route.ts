import { NextRequest, NextResponse } from "next/server";
import { fetchAddresses } from "@/lib/epc";
import { fetchVoaAddresses } from "@/lib/voa";
import { AddressMatch } from "@/lib/types";

// The specific addresses at a postcode, for the property picker. Two free sources merged:
// the EPC register (gives UPRN + energy band) and the VOA council-tax register (covers homes with
// no EPC). VOA is best-effort - if it throttles, the picker falls back to EPC-only.
export async function GET(req: NextRequest) {
  const postcode = (req.nextUrl.searchParams.get("postcode") ?? "").trim();
  if (!postcode) return NextResponse.json([]);
  try {
    const [epc, voa] = await Promise.all([
      fetchAddresses(postcode),
      fetchVoaAddresses(postcode).catch(() => []),
    ]);
    return NextResponse.json(merge(epc, voa, postcode.toUpperCase()));
  } catch {
    return NextResponse.json([]);
  }
}

// Merge by building number: EPC entries win (they carry UPRN + energy band); VOA-only dwellings
// (no EPC) are added with no UPRN but their council-tax band, so they're still pickable.
function merge(
  epc: AddressMatch[],
  voa: { line1: string; band: string }[],
  postcode: string,
): AddressMatch[] {
  const byKey = new Map<string, AddressMatch>();
  for (const a of epc) byKey.set(buildingKey(a.line1), a);
  for (const v of voa) {
    const k = buildingKey(v.line1);
    if (byKey.has(k)) continue;
    byKey.set(k, {
      uprn: "",
      line1: v.line1,
      address: `${v.line1}, ${postcode}`,
      postcode,
      epcBand: null,
      ctaxBand: v.band,
    });
  }
  const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
  return [...byKey.values()].sort((a, b) => collator.compare(a.line1, b.line1));
}

// Numbered addresses key on the leading number (so EPC "96 …" and VOA "96 …" merge); named/flat
// addresses (no leading number) key on the whole normalised line.
function buildingKey(line1: string): string {
  const t = line1.trim().toUpperCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  return t.match(/^\d+[A-Z]?\b/)?.[0] ?? t;
}
