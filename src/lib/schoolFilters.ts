import { School, OfstedRating } from "./types";
import { PhaseFilter, matchesPhase, phaseTabs } from "./phase";

// Human labels for the non-mainstream register categories (School.kind).
export const KIND_LABEL: Record<NonNullable<School["kind"]>, string> = {
  special: "Special school",
  alternative: "Alternative provision",
  independent: "Independent",
};

// The full school-filter state. `phase` is driven by the chips; the rest by the Filters panel.
export interface SchoolFilters {
  phase: PhaseFilter;
  gender: "any" | "Mixed" | "Boys" | "Girls";
  faith: "any" | "faith" | "secular";
  selective: boolean; // grammar (selective) admissions only
  rating: "any" | "good" | "outstanding";
  // Whether to include each non-mainstream kind - all on by default (we don't hide real schools);
  // unchecking a kind that's present removes it from the map + list together.
  showSpecial: boolean;
  showIndependent: boolean;
  showAlternative: boolean;
}

export const DEFAULT_FILTERS: SchoolFilters = {
  phase: "all",
  gender: "any",
  faith: "any",
  selective: false,
  rating: "any",
  showSpecial: true,
  showIndependent: true,
  showAlternative: true,
};

const GOOD_OR_BETTER: OfstedRating[] = ["Outstanding", "Good"];

export function matchesFilters(s: School, f: SchoolFilters): boolean {
  if (!matchesPhase(s, f.phase)) return false;
  if (s.kind === "special" && !f.showSpecial) return false;
  if (s.kind === "independent" && !f.showIndependent) return false;
  if (s.kind === "alternative" && !f.showAlternative) return false;
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

// Which secondary filters are worth offering for this result set - hide controls that can't
// distinguish anything (e.g. no faith schools nearby, or every school is mixed).
export function filterAvailability(schools: School[]): {
  genders: string[];
  hasFaith: boolean;
  hasSelective: boolean;
  kinds: { special: boolean; independent: boolean; alternative: boolean };
} {
  const genders = new Set<string>();
  let faith = false;
  let secular = false;
  let selective = false;
  const kinds = { special: false, independent: false, alternative: false };
  for (const s of schools) {
    if (s.gender) genders.add(s.gender);
    if (s.religion) faith = true;
    else secular = true;
    if (s.selective) selective = true;
    if (s.kind) kinds[s.kind] = true;
  }
  return {
    genders: ["Mixed", "Boys", "Girls"].filter((g) => genders.has(g)),
    hasFaith: faith && secular, // a faith filter only helps when both kinds are present
    hasSelective: selective,
    kinds,
  };
}

// Count of active *secondary* filters (phase has its own chips, so it's excluded here).
export function activeFilterCount(f: SchoolFilters): number {
  return (
    (f.gender !== "any" ? 1 : 0) +
    (f.faith !== "any" ? 1 : 0) +
    (f.selective ? 1 : 0) +
    (f.rating !== "any" ? 1 : 0) +
    (f.showSpecial ? 0 : 1) +
    (f.showIndependent ? 0 : 1) +
    (f.showAlternative ? 0 : 1)
  );
}
