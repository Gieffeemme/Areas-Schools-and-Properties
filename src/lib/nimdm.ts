import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NimdmDomains, NimdmSummary } from "./types";

// NIMDM 2017 overall rank/decile + seven domain deciles, keyed by SOA code (build-nimdm.mjs). Northern
// Ireland only. Read from disk at runtime (not import-bundled) so the JSON isn't literal-type-inferred
// by `next build` — see src/lib/imd.ts and next.config.ts → outputFileTracingIncludes.
type Record_ = { rank: number; decile: number } & NimdmDomains;
let cached: { count: number; bySoa: Record<string, Record_> } | undefined;
function data(): { count: number; bySoa: Record<string, Record_> } {
  return (cached ??= JSON.parse(
    readFileSync(join(process.cwd(), "src", "data", "nimdm-by-soa.json"), "utf8"),
  ) as { count: number; bySoa: Record<string, Record_> });
}

// `code` is the NI SOA (postcodes.io codes.lsoa11, e.g. 95GG20S1); NIMDM 2017 is on those 890 SOAs.
export function nimdmForSoa(code?: string): NimdmSummary | undefined {
  if (!code) return undefined;
  const { count, bySoa } = data();
  const r = bySoa[code];
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
      living: r.living,
      access: r.access,
    },
  };
}
