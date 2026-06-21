"use client";

import { useMemo, useState } from "react";
import { School } from "@/lib/types";
import SchoolCard from "./SchoolCard";

type PhaseFilter = "all" | "primary" | "secondary";

// All-through schools serve both phases, so they count under Primary and Secondary.
function matches(s: School, f: PhaseFilter): boolean {
  if (f === "all") return true;
  if (f === "primary") return s.phase === "Primary" || s.phase === "All-through";
  return s.phase === "Secondary" || s.phase === "All-through";
}

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
  const primaryCount = useMemo(() => schools.filter((s) => matches(s, "primary")).length, [schools]);
  const secondaryCount = useMemo(() => schools.filter((s) => matches(s, "secondary")).length, [schools]);
  // Only offer the filter when there's actually a mix to split.
  const canFilter = primaryCount > 0 && secondaryCount > 0;
  const shown = useMemo(
    () => (canFilter && filter !== "all" ? schools.filter((s) => matches(s, filter)) : schools),
    [schools, filter, canFilter],
  );

  const tabs: { key: PhaseFilter; label: string; count: number }[] = [
    { key: "all", label: "All", count: schools.length },
    { key: "primary", label: "Primary", count: primaryCount },
    { key: "secondary", label: "Secondary", count: secondaryCount },
  ];

  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Schools</h2>
        <span className="text-xs text-[var(--muted)]">
          {filter !== "all" && canFilter
            ? `${shown.length} of ${schools.length} · ${radiusMiles} mi`
            : `${schools.length} within ${radiusMiles} mile${radiusMiles === 1 ? "" : "s"}`}
        </span>
      </header>

      {canFilter && (
        <div className="mb-2 inline-flex overflow-hidden rounded-lg border border-[var(--border)] bg-white text-xs">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={`px-2.5 py-1 transition ${
                filter === t.key
                  ? "bg-[var(--primary)] font-semibold text-white"
                  : "text-[var(--muted)] hover:bg-slate-50"
              }`}
            >
              {t.label} <span className={filter === t.key ? "opacity-80" : "opacity-50"}>{t.count}</span>
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
