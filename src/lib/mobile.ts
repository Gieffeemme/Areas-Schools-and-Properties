import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MobileSummary } from "./types";

// Ofcom mobile coverage by local authority (build-mobile.mjs), read at runtime and keyed by LAUA code -
// the same join as broadband (postcodes.io codes.admin_district). Small file; kept out of the import
// bundle for consistency with the other committed datasets.
let cached: Record<string, MobileSummary> | undefined;
function map(): Record<string, MobileSummary> {
  if (cached) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src", "data", "mobile-by-laua.json"), "utf8"),
    ) as Record<string, MobileSummary>;
  } catch {
    cached = {};
  }
  return cached;
}

export function mobileForLaua(lauaCode?: string): MobileSummary | null {
  return lauaCode ? map()[lauaCode] ?? null : null;
}
