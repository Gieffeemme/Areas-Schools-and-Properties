import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AffordabilitySummary } from "./types";

// House-price-to-earnings affordability ratio for the local authority, from a COMMITTED ONS dataset
// (build-affordability.mjs), read at runtime and keyed by LA code (postcodes.io codes.admin_district =
// facts.lauaCode) - the same join as broadband/mobile. England & Wales; the ratio is median house price
// ÷ median gross annual workplace-based earnings (higher = less affordable).
interface AffordabilityFile {
  year: string;
  median: number; // England & Wales median ratio
  byLaua: Record<string, number>;
}

let cached: AffordabilityFile | null | undefined;
function file(): AffordabilityFile | null {
  if (cached !== undefined) return cached;
  try {
    cached = JSON.parse(
      readFileSync(join(process.cwd(), "src", "data", "affordability-by-laua.json"), "utf8"),
    ) as AffordabilityFile;
  } catch {
    cached = null;
  }
  return cached;
}

export function affordabilityForLaua(lauaCode?: string): AffordabilitySummary | null {
  const data = file();
  if (!data || !lauaCode) return null;
  const ratio = data.byLaua[lauaCode];
  if (ratio == null) return null; // outside E&W (Scotland/NI) → no panel
  return { ratio, median: data.median, year: data.year };
}
