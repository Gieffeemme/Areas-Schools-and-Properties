import { School } from "./types";

export type PhaseFilter = "all" | "nursery" | "primary" | "secondary" | "sixthform" | "allthrough";

// All-through schools serve every phase, so they also count under primary/secondary/sixth-form.
export function matchesPhase(s: School, f: PhaseFilter): boolean {
  const p = s.phase;
  if (f === "all") return true;
  if (f === "nursery") return p === "Nursery";
  if (f === "primary") return p === "Primary" || p === "All-through";
  if (f === "secondary") return p === "Secondary" || p === "All-through";
  if (f === "sixthform") return p === "Sixth form" || p === "College" || p === "All-through";
  return p === "All-through"; // allthrough
}

export const PHASE_CATS: { key: PhaseFilter; label: string }[] = [
  { key: "nursery", label: "Nursery" },
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "sixthform", label: "Sixth form / college" },
  { key: "allthrough", label: "All-through" },
];

export interface PhaseTab {
  key: PhaseFilter;
  label: string;
  count: number;
}

// Derives the chip tabs (All + each non-empty phase), plus the *effective* filter - which falls
// back to "all" when the requested phase is empty or fewer than two phases exist (nothing to
// filter between). Map pins and the list both use effFilter so they always stay in sync.
export function phaseTabs(
  schools: School[],
  filter: PhaseFilter,
): { tabs: PhaseTab[]; effFilter: PhaseFilter; canFilter: boolean } {
  const counts: Record<string, number> = {};
  for (const cat of PHASE_CATS) counts[cat.key] = schools.filter((s) => matchesPhase(s, cat.key)).length;

  const active = PHASE_CATS.filter((c) => counts[c.key] > 0);
  const canFilter = active.length >= 2;
  const effFilter: PhaseFilter =
    canFilter && filter !== "all" && counts[filter] > 0 ? filter : "all";

  const tabs: PhaseTab[] = [
    { key: "all", label: "All", count: schools.length },
    ...active.map((c) => ({ key: c.key, label: c.label, count: counts[c.key] })),
  ];
  return { tabs, effFilter, canFilter };
}
