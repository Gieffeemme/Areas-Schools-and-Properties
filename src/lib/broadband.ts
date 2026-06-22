import { readFileSync } from "node:fs";
import { join } from "node:path";
import { BroadbandSummary } from "./types";

// Ofcom fixed-broadband coverage by local authority (build-broadband.mjs), read at runtime and keyed
// by LAUA code - which we already resolve per postcode (postcodes.io codes.admin_district). Small
// file, but kept out of the import bundle for consistency with the other datasets.
let cached: Record<string, BroadbandSummary> | undefined;
function map(): Record<string, BroadbandSummary> {
  if (cached) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src", "data", "broadband-by-laua.json"), "utf8"),
    ) as Record<string, BroadbandSummary>;
  } catch {
    cached = {};
  }
  return cached;
}

export function broadbandForLaua(lauaCode?: string): BroadbandSummary | null {
  return lauaCode ? map()[lauaCode] ?? null : null;
}
