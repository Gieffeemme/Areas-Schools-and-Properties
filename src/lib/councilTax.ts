import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CouncilTaxSummary } from "./types";

// VOA Council Tax band counts keyed by LSOA 2011 code (build-council-tax.mjs), England & Wales. Read
// from disk at runtime (not import-bundled) so the 2.7 MB JSON isn't literal-type-inferred by
// `next build` - see src/lib/imd.ts and next.config.ts → outputFileTracingIncludes.
type Entry = { bands: Record<string, number>; total: number };
let cached: Record<string, Entry> | undefined;
function map(): Record<string, Entry> {
  return (cached ??= JSON.parse(
    readFileSync(join(process.cwd(), "src", "data", "council-tax-bands-by-lsoa.json"), "utf8"),
  ) as Record<string, Entry>);
}

export function councilTaxForLsoa(code?: string): CouncilTaxSummary | undefined {
  const e = code ? map()[code] : undefined;
  if (!e) return undefined;
  const typicalBand =
    Object.entries(e.bands).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
  return { total: e.total, bands: e.bands, typicalBand };
}

// Actual annual council tax (£) per band (A-H), all precepts in, keyed by billing-authority ONS code
// (build-council-tax-cost.mjs - MHCLG, England). Runtime fs read like above.
let costCached: Record<string, Record<string, number>> | undefined;
function costMap(): Record<string, Record<string, number>> {
  return (costCached ??= JSON.parse(
    readFileSync(join(process.cwd(), "src", "data", "council-tax-cost-by-laua.json"), "utf8"),
  ) as Record<string, Record<string, number>>);
}

export function councilTaxCostForLaua(lauaCode?: string): Record<string, number> | undefined {
  return lauaCode ? costMap()[lauaCode] : undefined;
}
