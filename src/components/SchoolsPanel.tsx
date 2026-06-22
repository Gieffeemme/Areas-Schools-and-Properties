"use client";

import { useMemo, useState } from "react";
import { School } from "@/lib/types";
import SchoolCard from "./SchoolCard";

type PhaseFilter = "all" | "nursery" | "primary" | "secondary" | "sixthform" | "allthrough";

// All-through schools serve every phase, so they also count under primary/secondary/sixth-form.
function matches(s: School, f: PhaseFilter): boolean {
  const p = s.phase;
  if (f === "all") return true;
  if (f === "nursery") return p === "Nursery";
  if (f === "primary") return p === "Primary" || p === "All-through";
  if (f === "secondary") return p === "Secondary" || p === "All-through";
  if (f === "sixthform") return p === "Sixth form" || p === "College" || p === "All-through";
  return p === "All-through"; // allthrough
}

const CATS: { key: PhaseFilter; label: string }[] = [
  { key: "nursery", label: "Nursery" },
  { key: "primary", label: "Primary" },
  { key: "secondary", label: "Secondary" },
  { key: "sixthform", label: "Sixth form / college" },
  { key: "allthrough", label: "All-through" },
];

export default function SchoolsPanel({
  schools,
  radiusMiles,
  ofstedLoaded,
  onSelect,
}: {
  schools: School[];
  radiusMiles: number;
  ofstedLoaded: boolean;
  onSelect?: (s: School) => void;
}) {
  const [filter, setFilter] = useState<PhaseFilter>("all");
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const cat of CATS) c[cat.key] = schools.filter((s) => matches(s, cat.key)).length;
    return c;
  }, [schools]);
  const active = CATS.filter((c) => counts[c.key] > 0);
  // Only offer the filter when there are at least two distinct categories to split.
  const canFilter = active.length >= 2;
  // If the selected category is empty for this result set (e.g. after a new search), fall back to All.
  const effFilter: PhaseFilter =
    canFilter && filter !== "all" && counts[filter] > 0 ? filter : "all";
  const shown = useMemo(
    () => (effFilter === "all" ? schools : schools.filter((s) => matches(s, effFilter))),
    [schools, effFilter],
  );

  const tabs: { key: PhaseFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: schools.length },
    ...active.map((c) => ({ ...c, count: counts[c.key] })),
  ];

  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Schools</h2>
        <span className="text-xs text-[var(--muted)]">
          {effFilter !== "all"
            ? `${shown.length} of ${schools.length} · ${radiusMiles} mi`
            : `${schools.length} within ${radiusMiles} mile${radiusMiles === 1 ? "" : "s"}`}
        </span>
      </header>

      {canFilter && (
        <div className="mb-2 flex flex-wrap gap-1 text-xs">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-md border px-2 py-1 transition ${
                effFilter === t.key
                  ? "border-[var(--primary)] bg-[var(--primary)] font-semibold text-white"
                  : "border-[var(--border)] bg-white text-[var(--muted)] hover:bg-slate-50"
              }`}
            >
              {t.label} <span className={effFilter === t.key ? "opacity-80" : "opacity-50"}>{t.count}</span>
            </button>
          ))}
        </div>
      )}

      {schools.length === 0 ? (
        <p className="rounded-lg bg-white p-3 text-sm text-[var(--muted)] shadow-sm">
          No schools found in this radius.
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((s) => (
            <SchoolCard key={s.id} school={s} onClick={() => onSelect?.(s)} />
          ))}
        </div>
      )}

      {ofstedLoaded ? (
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
          Ofsted overall grades from official MI — check the inspection year; many pre-date Ofsted’s
          2024 grade changes. Independent schools aren’t Ofsted-rated.
        </p>
      ) : schools.length > 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          Locations are live from OpenStreetMap. Ofsted grades aren’t loaded — run{" "}
          <code className="rounded bg-amber-100 px-1 font-mono">npm run etl:schools</code>.
        </p>
      ) : null}
    </section>
  );
}
