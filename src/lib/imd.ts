import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImdDomains } from "./types";

// IMD 2019 domain deciles keyed by LSOA 2011 code (build-imd.mjs). England only. Read from disk at
// runtime (not import-bundled) so the 3.1 MB JSON isn't literal-type-inferred by `next build` — see
// src/lib/schools.ts and next.config.ts → outputFileTracingIncludes.
let cached: Record<string, ImdDomains> | undefined;
function map(): Record<string, ImdDomains> {
  return (cached ??= JSON.parse(
    readFileSync(join(process.cwd(), "src", "data", "imd-domains-by-lsoa.json"), "utf8"),
  ) as Record<string, ImdDomains>);
}

export function imdDomainsForLsoa(code?: string): ImdDomains | undefined {
  return code ? map()[code] : undefined;
}
