"use client";

import { School } from "@/lib/types";
import { PhaseFilter, phaseTabs } from "@/lib/phase";

// Controlled phase-filter chips. Renders nothing when there's only one phase to show (nothing to
// filter between). Shared by the list panel and the map-only view so both drive the same filter.
export default function PhaseChips({
  schools,
  filter,
  onFilter,
  className = "",
}: {
  schools: School[];
  filter: PhaseFilter;
  onFilter: (f: PhaseFilter) => void;
  className?: string;
}) {
  const { tabs, effFilter, canFilter } = phaseTabs(schools, filter);
  if (!canFilter) return null;

  return (
    <div className={`flex flex-wrap gap-1 text-xs ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onFilter(t.key)}
          className={`rounded-md border px-2 py-1 transition ${
            effFilter === t.key
              ? "border-[var(--primary)] bg-[var(--primary)] font-semibold text-white"
              : "border-[var(--border)] bg-white text-[var(--muted)] hover:bg-slate-50"
          }`}
        >
          {t.label}{" "}
          <span className={effFilter === t.key ? "opacity-80" : "opacity-50"}>{t.count}</span>
        </button>
      ))}
    </div>
  );
}
