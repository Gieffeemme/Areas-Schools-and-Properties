import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GreenSpaceSummary } from "./types";

// ONS green-space access (build-greenspace.mjs): public green space by 2011 LSOA/data zone, private
// garden share by 2011 MSOA. Great Britain (not NI). Runtime fs read (not import-bundled) — see imd.ts.
type Data = { byLsoa: Record<string, { dist: number; within: number | null }>; byMsoa: Record<string, number> };
let cached: Data | undefined;
function data(): Data {
  return (cached ??= JSON.parse(
    readFileSync(join(process.cwd(), "src", "data", "greenspace.json"), "utf8"),
  ) as Data);
}

// `lsoaCode` = postcodes.io codes.lsoa11 (2011 LSOA / Scottish data zone); `msoaCode` = codes.msoa.
export function greenSpaceForArea(lsoaCode?: string, msoaCode?: string): GreenSpaceSummary | undefined {
  if (!lsoaCode) return undefined;
  const { byLsoa, byMsoa } = data();
  const p = byLsoa[lsoaCode];
  if (!p) return undefined; // GB only — NI SOAs (95…) and unmatched LSOAs fall through
  return {
    nearestParkM: p.dist,
    parksWithin1km: p.within,
    gardenPct: msoaCode && byMsoa[msoaCode] != null ? byMsoa[msoaCode] : null,
  };
}
