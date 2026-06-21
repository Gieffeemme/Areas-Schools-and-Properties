import { School } from "@/lib/types";
import SchoolCard from "./SchoolCard";

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
  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Schools</h2>
        <span className="text-xs text-[var(--muted)]">
          {schools.length} within {radiusMiles} mile{radiusMiles === 1 ? "" : "s"}
        </span>
      </header>

      {schools.length === 0 ? (
        <p className="rounded-lg bg-white p-3 text-sm text-[var(--muted)] shadow-sm">
          No schools found in this radius.
        </p>
      ) : (
        <div className="space-y-2">
          {schools.map((s) => (
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
