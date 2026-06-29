import { School } from "./types";

export type SchoolNation = NonNullable<School["nation"]>;

// Per-nation context for non-England schools. None of these inspectorates publish an Ofsted-style
// single grade, and the schools aren't in the DfE data — so the UI shows a neutral nation tag + a
// per-school directory link (the link URL itself is stored on School.ofstedReport, built in each
// nation's ETL). Keyed by School.nation.
export const NATION_SCHOOL_INFO: Record<SchoolNation, {
  short: string; // compact tag on the card/map pin
  inspectorate: string; // who inspects (narrative reports, no single grade)
  linkLabel: string; // label for the per-school directory link
}> = {
  Wales: { short: "Wales", inspectorate: "Estyn", linkLabel: "My Local School" },
  Scotland: { short: "Scotland", inspectorate: "Education Scotland", linkLabel: "Parentzone Scotland" },
  "Northern Ireland": { short: "NI", inspectorate: "ETI", linkLabel: "DE Schools Plus" },
};
