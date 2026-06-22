import { School, OfstedRating } from "./types";
import { PhaseFilter, matchesPhase, phaseTabs } from "./phase";

// The full school-filter state. `phase` is driven by the chips; the rest by the Filters panel.
export interface SchoolFilters {
  phase: PhaseFilter;
  gender: "any" | "Mixed" | "Boys" | "Girls";
  faith: "any" | "faith" | "secular";
  selective: boolean; // grammar (selective) admissions only
  rating: "any" | "good" | "outstanding";
}

export const DEFAULT_FILTERS: SchoolFilters = {
  phase: "all",
  gender: "any",
  faith: "any",
  selective: false,
  rating: "any",
};

const GOOD_OR_BETTER: OfstedRating[] = ["Outstanding", "Good"];

export function matchesFilters(s: School, f: SchoolFilters): boolean {
  if (!matchesPhase(s, f.phase)) return false;
  if (f.gender !== "any" && s.gender !== f.gender) return false;
  if (f.faith === "faith" && !s.religion) return false;
  if (f.faith === "secular" && s.religion) return false;
  if (f.selective && !s.selective) return false;
  if (f.rating === "good" && !GOOD_OR_BETTER.includes(s.ofsted)) return false;
  if (f.rating === "outstanding" && s.ofsted !== "Outstanding") return false;
  return true;
}

// Replace the requested phase with the effective one (phaseTabs falls back to "all" when the
// requested phase is empty), so the map pins and list always agree with what the chips highlight.
export function effectiveFilters(schools: School[], f: SchoolFilters): SchoolFilters {
  const { effFilter } = phaseTabs(schools, f.phase);
  return f.phase === effFilter ? f : { ...f, phase: effFilter };
}

export function applyFilters(schools: School[], f: SchoolFilters): School[] {
  const eff = effectiveFilters(schools, f);
  return schools.filter((s) => matchesFilters(s, eff));
}

// Which secondary filters are worth offering for this result set — hide controls that can't
// distinguish anything (e.g. no faith schools nearby, or every school is mixed).
export function filterAvailability(schools: School[]): {
  genders: string[];
  hasFaith: boolean;
  hasSelective: boolean;
} {
  const genders = new Set<string>();
  let faith = false;
  let secular = false;
  let selective = false;
  for (const s of schools) {
    if (s.gender) genders.add(s.gender);
    if (s.religion) faith = true;
    else secular = true;
    if (s.selective) selective = true;
  }
  return {
    genders: ["Mixed", "Boys", "Girls"].filter((g) => genders.has(g)),
    hasFaith: faith && secular, // a faith filter only helps when both kinds are present
    hasSelective: selective,
  };
}

// Count of active *secondary* filters (phase has its own chips, so it's excluded here).
export function activeFilterCount(f: SchoolFilters): number {
  return (
    (f.gender !== "any" ? 1 : 0) +
    (f.faith !== "any" ? 1 : 0) +
    (f.selective ? 1 : 0) +
    (f.rating !== "any" ? 1 : 0)
  );
}
