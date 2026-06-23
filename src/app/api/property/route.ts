import { NextRequest, NextResponse } from "next/server";
import { geocodePostcode } from "@/lib/geocode";
import { fetchEpcByUprn, fetchFullCertificate } from "@/lib/epc";
import { fetchAddressSales } from "@/lib/prices";
import { fetchCouncilTaxBand } from "@/lib/voa";
import { fetchFlood } from "@/lib/flood";
import { fetchPlanning } from "@/lib/planning";
import { fetchPlanningConstraints } from "@/lib/planningConstraints";
import { nearestStations } from "@/lib/transport";
import { nearbyCqc } from "@/lib/cqc";
import { councilTaxCostForLaua } from "@/lib/councilTax";
import { PropertyReport } from "@/lib/types";

// A report for one SPECIFIC property (picked from the address list). Assembles per-address facts from
// EPC (band, by UPRN), HM Land Registry (this address's sale history), the VOA (exact council-tax
// band, best-effort), and the Environment Agency (flood) - plus the LSOA/area context from geocoding.
// Each source fails independently; the council-tax band falls back to the LSOA typical band.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const postcode = (sp.get("postcode") ?? "").trim();
  const uprn = (sp.get("uprn") ?? "").trim();
  const line1 = (sp.get("line1") ?? "").trim();
  const address = (sp.get("address") ?? "").trim() || line1;
  if (!postcode || !line1) {
    return NextResponse.json({ error: "postcode and line1 are required" }, { status: 400 });
  }

  // Geocoding is the one hard dependency (area facts + centroid for flood/map).
  let geo;
  try {
    geo = await geocodePostcode(postcode);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Postcode lookup failed" },
      { status: 404 },
    );
  }
  const { centre, facts } = geo;

  const [epcR, salesR, voaR, floodR, planningR, constraintsR] = await Promise.allSettled([
    fetchEpcByUprn(uprn),
    fetchAddressSales(postcode, line1),
    fetchCouncilTaxBand(postcode, line1),
    fetchFlood(centre),
    fetchPlanning(centre),
    fetchPlanningConstraints(centre),
  ]);

  const epc = epcR.status === "fulfilled" ? epcR.value : null;
  const sales = salesR.status === "fulfilled" ? salesR.value : [];
  const voa = voaR.status === "fulfilled" ? voaR.value : null;
  const flood = floodR.status === "fulfilled" ? floodR.value : null;
  const planning = planningR.status === "fulfilled" ? planningR.value : null;
  const planningConstraints = constraintsR.status === "fulfilled" ? constraintsR.value : null;
  // Nearest stations + CQC-rated health/care services: committed-dataset lookups (no network) - see
  // src/lib/transport.ts / src/lib/cqc.ts.
  const transport = nearestStations(centre);
  const cqc = nearbyCqc(centre);

  // Full EPC certificate (floor area, heating, fabric, current/potential rating) by the LMK from the
  // band lookup above. Same token as the search; fails gracefully to null.
  const epcDetails = epc?.lmk ? await fetchFullCertificate(epc.lmk).catch(() => null) : null;

  const ctBand = voa ? voa.band : (facts.councilTax?.typicalBand ?? null);
  const ctCosts = councilTaxCostForLaua(facts.lauaCode);
  const councilTax: PropertyReport["councilTax"] = {
    band: ctBand,
    source: voa ? "voa" : "lsoa-typical",
    annualCost: ctBand && ctCosts ? (ctCosts[ctBand] ?? null) : null,
    neighbourhood: facts.councilTax ?? null,
  };

  const tenure = sales.find((s) => s.tenure)?.tenure ?? null;

  const report: PropertyReport = {
    address,
    line1,
    postcode: facts.postcode || postcode,
    uprn,
    centre,
    facts,
    epc,
    epcDetails,
    councilTax,
    sales,
    tenure,
    flood,
    planning,
    planningConstraints,
    transport,
    cqc,
    generatedAt: new Date().toISOString(),
  };
  return NextResponse.json(report);
}
