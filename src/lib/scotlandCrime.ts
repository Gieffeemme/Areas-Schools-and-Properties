import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ScotlandCrimeGroup, ScotlandCrimeSummary } from "./types";

// Council-area recorded crime keyed by LA code (S12…), from build-scotland-crime.mjs. Scotland only.
// Read from disk at runtime (not import-bundled) — see src/lib/imd.ts and next.config.ts tracing.
type Record_ = { name: string; rate: number; count: number | null; groups: ScotlandCrimeGroup[] };
type Data = { year: string; scotlandRate: number; byLaua: Record<string, Record_> };
let cached: Data | undefined;
function data(): Data {
  return (cached ??= JSON.parse(
    readFileSync(join(process.cwd(), "src", "data", "scotland-crime-by-laua.json"), "utf8"),
  ) as Data);
}

// `code` is the council-area code (postcodes.io codes.admin_district, e.g. S12000036).
export function scotlandCrimeForLaua(code?: string): ScotlandCrimeSummary | undefined {
  if (!code) return undefined;
  const { year, scotlandRate, byLaua } = data();
  const r = byLaua[code];
  if (!r) return undefined;
  return { year, laName: r.name, rate: r.rate, count: r.count, scotlandRate, groups: r.groups };
}
