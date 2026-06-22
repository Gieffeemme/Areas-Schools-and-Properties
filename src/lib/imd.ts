import imdData from "@/data/imd-domains-by-lsoa.json";
import { ImdDomains } from "./types";

// IMD 2019 domain deciles keyed by LSOA 2011 code (build-imd.mjs). England only.
const map = imdData as Record<string, ImdDomains>;

export function imdDomainsForLsoa(code?: string): ImdDomains | undefined {
  return code ? map[code] : undefined;
}
