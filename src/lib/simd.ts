import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SimdDomains, SimdSummary } from "./types";

// SIMD 2020v2 overall rank/decile + seven domain deciles, keyed by 2011 data zone code (build-simd.mjs).
// Scotland only. Read from disk at runtime (not import-bundled) so the JSON isn't literal-type-inferred
// by `next build` — see src/lib/imd.ts and next.config.ts → outputFileTracingIncludes.
type Record_ = { rank: number; decile: number } & SimdDomains;
let cached: { count: number; byZone: Record<string, Record_> } | undefined;
function data(): { count: number; byZone: Record<string, Record_> } {
  return (cached ??= JSON.parse(
    readFileSync(join(process.cwd(), "src", "data", "simd-by-datazone.json"), "utf8"),
  ) as { count: number; byZone: Record<string, Record_> });
}

// `code` is the 2011 data zone (postcodes.io codes.lsoa11); SIMD 2020 is on 2011 data zones.
export function simdForDatazone(code?: string): SimdSummary | undefined {
  if (!code) return undefined;
  const { count, byZone } = data();
  const r = byZone[code];
  if (!r) return undefined;
  return {
    rank: r.rank,
    decile: r.decile,
    count,
    domains: {
      income: r.income,
      employment: r.employment,
      education: r.education,
      health: r.health,
      crime: r.crime,
      housing: r.housing,
      access: r.access,
    },
  };
}
