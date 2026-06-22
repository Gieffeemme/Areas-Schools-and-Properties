"use client";

import { useMemo, useState } from "react";
import { School } from "@/lib/types";
import { SchoolFilters, applyFilters } from "@/lib/schoolFilters";
import SchoolControls from "./SchoolControls";
import SchoolCard from "./SchoolCard";

type SortKey = "distance" | "name" | "ofsted" | "p8" | "att8" | "ks2" | "alevel" | "parent";

const OFSTED_RANK: Record<string, number> = {
  Outstanding: 0, Good: 1, "Requires improvement": 2, Inadequate: 3, "Not rated": 4, "Not loaded": 5,
};

const SORTS: { key: SortKey; label: string }[] = [
  { key: "distance", label: "Distance" },
  { key: "name", label: "Name (A–Z)" },
  { key: "ofsted", label: "Ofsted" },
  { key: "p8", label: "GCSE · Progress 8" },
  { key: "att8", label: "GCSE · Attainment 8" },
  { key: "ks2", label: "KS2 · RWM expected" },
  { key: "alevel", label: "A-level · points" },
  { key: "parent", label: "Parent View" },
];

// "Best" first; schools missing the metric sink below those that have it. Within an equal or
// absent metric, a better Ofsted grade wins, then nearer distance — so e.g. a Parent View sort
// no longer lists a "Good" school above an "Outstanding" one among the schools that lack a Parent
// View score (nurseries and preschools aren't in the survey at all).
function comparator(key: SortKey): (a: School, b: School) => number {
  if (key === "distance") return (a, b) => a.distanceMiles - b.distanceMiles;
  if (key === "name") return (a, b) => a.name.localeCompare(b.name);

  const byQuality = (a: School, b: School) =>
    (OFSTED_RANK[a.ofsted] ?? 9) - (OFSTED_RANK[b.ofsted] ?? 9) || a.distanceMiles - b.distanceMiles;
  if (key === "ofsted") return byQuality;

  const get: (s: School) => number | null | undefined =
    key === "p8" ? (s) => s.progress8
    : key === "att8" ? (s) => s.attainment8
    : key === "ks2" ? (s) => s.ks2?.rwmExp
    : key === "alevel" ? (s) => s.alevel?.aps
    : (s) => s.parentViewHappy;
  return (a, b) => {
    const av = get(a), bv = get(b);
    if (av != null && bv != null) return bv - av || byQuality(a, b);
    if (av != null) return -1; // schools with the metric rank above those without
    if (bv != null) return 1;
    return byQuality(a, b); // neither has the metric → Ofsted grade, then distance
  };
}

const SHORTLIST_KEY = "areaintel:shortlist";
// SchoolsPanel only renders client-side (after a search), so reading localStorage in the lazy
// initializer is safe — no SSR pass renders it, hence no hydration mismatch.
function loadShortlist(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(SHORTLIST_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch {
    return new Set();
  }
}

export default function SchoolsPanel({
  schools,
  radiusMiles,
  ofstedLoaded,
  onSelect,
  filters,
  onChange,
}: {
  schools: School[];
  radiusMiles: number;
  ofstedLoaded: boolean;
  onSelect?: (s: School) => void;
  filters: SchoolFilters;
  onChange: (f: SchoolFilters) => void;
}) {
  const [sort, setSort] = useState<SortKey>("distance");
  const [shortlist, setShortlist] = useState<Set<string>>(loadShortlist);
  const [shortlistOnly, setShortlistOnly] = useState(false);

  const toggleShortlist = (id: string) =>
    setShortlist((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(SHORTLIST_KEY, JSON.stringify([...next]));
      } catch {
        /* storage unavailable */
      }
      return next;
    });

  const shortlistedCount = useMemo(
    () => schools.filter((s) => shortlist.has(s.id)).length,
    [schools, shortlist],
  );

  const shown = useMemo(() => {
    let list = applyFilters(schools, filters);
    if (shortlistOnly) list = list.filter((s) => shortlist.has(s.id));
    return [...list].sort(comparator(sort));
  }, [schools, filters, shortlistOnly, shortlist, sort]);

  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Schools</h2>
        <span className="text-xs text-[var(--muted)]">
          {shown.length !== schools.length
            ? `${shown.length} of ${schools.length} · ${radiusMiles} mi`
            : `${schools.length} within ${radiusMiles} mile${radiusMiles === 1 ? "" : "s"}`}
        </span>
      </header>

      <SchoolControls schools={schools} filters={filters} onChange={onChange} className="mb-2" />


      {schools.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1 text-[var(--muted)]">
            Sort
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              className="rounded-md border border-[var(--border)] bg-white px-1.5 py-1 text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {shortlistedCount > 0 && (
            <button
              onClick={() => setShortlistOnly((v) => !v)}
              className={`rounded-md border px-2 py-1 font-medium transition ${
                shortlistOnly
                  ? "border-amber-400 bg-amber-50 text-amber-700"
                  : "border-[var(--border)] bg-white text-[var(--muted)] hover:bg-slate-50"
              }`}
            >
              ★ Shortlist ({shortlistedCount})
            </button>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-lg bg-white p-3 text-sm text-[var(--muted)] shadow-sm">
          {schools.length === 0 ? "No schools found in this radius." : "No schools match the current filter."}
        </p>
      ) : (
        <div className="space-y-2">
          {shown.map((s) => (
            <SchoolCard
              key={s.id}
              school={s}
              onClick={() => onSelect?.(s)}
              shortlisted={shortlist.has(s.id)}
              onToggleShortlist={() => toggleShortlist(s.id)}
            />
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
          Ofsted grades aren’t loaded — run{" "}
          <code className="rounded bg-amber-100 px-1 font-mono">npm run etl:schools</code>.
        </p>
      ) : null}
    </section>
  );
}
