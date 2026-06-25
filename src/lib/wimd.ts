import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WimdDomains, WimdSummary } from "./types";

// WIMD 2025 overall rank/decile + eight domain deciles, keyed by LSOA 2021 code (build-wimd.mjs).
// Wales only. Read from disk at runtime (not import-bundled) so the JSON isn't literal-type-inferred
// by `next build` — see src/lib/imd.ts and next.config.ts → outputFileTracingIncludes.
type Record_ = { rank: number; decile: number } & WimdDomains;
let cached: { count: number; byLsoa: Record<string, Record_> } | undefined;
function data(): { count: number; byLsoa: Record<string, Record_> } {
  return (cached ??= JSON.parse(
    readFileSync(join(process.cwd(), "src", "data", "wimd-by-lsoa.json"), "utf8"),
  ) as { count: number; byLsoa: Record<string, Record_> });
}

export function wimdForLsoa(code?: string): WimdSummary | undefined {
  if (!code) return undefined;
  const { count, byLsoa } = data();
  const r = byLsoa[code];
  if (!r) return undefined;
  return {
    rank: r.rank,
    decile: r.decile,
    count,
    domains: {
      income: r.income,
      employment: r.employment,
      health: r.health,
      education: r.education,
      access: r.access,
      housing: r.housing,
      community: r.community,
      physical: r.physical,
    },
  };
}
