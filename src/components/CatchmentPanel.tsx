"use client";

import { School } from "@/lib/types";

// An HONEST, distance-based catchment *estimate* — NOT real pupil-intake data (that needs restricted
// NPD microdata). For the searched point we show the nearest mainstream state school of each phase by
// straight-line distance, since many such schools prioritise admission by distance. Everything about
// how much this can differ from reality is spelled out in the disclaimer below.

function nearestOf(schools: School[], isPhase: (s: School) => boolean): School | undefined {
  // `schools` arrive sorted by distance. Exclude schools that don't admit by distance: independent
  // (fee-paying), special/alternative (SEND/AP), and selective grammars (admit by test).
  return schools.find((s) => isPhase(s) && !s.kind && !s.selective);
}

function Row({ label, school, onSelect }: { label: string; school?: School; onSelect?: (s: School) => void }) {
  return (
    <li className="flex items-baseline justify-between gap-2 text-sm">
      <span className="w-20 shrink-0 text-[var(--muted)]">{label}</span>
      {school ? (
        <span className="min-w-0 flex-1 text-right">
          <button
            type="button"
            onClick={() => onSelect?.(school)}
            className="truncate font-medium text-[var(--primary)] hover:underline"
            title={school.name}
          >
            {school.name}
          </button>
          {school.religion && <span className="ml-1 text-[11px] text-[var(--muted)]">· faith</span>}
          <span className="ml-2 whitespace-nowrap tabular-nums text-[var(--muted)]">{school.distanceMiles} mi</span>
        </span>
      ) : (
        <span className="flex-1 text-right text-[var(--muted)]">none within range</span>
      )}
    </li>
  );
}

export default function CatchmentPanel({
  schools,
  onSelect,
}: {
  schools: School[];
  onSelect?: (s: School) => void;
}) {
  const primary = nearestOf(schools, (s) => s.phase === "Primary" || s.phase === "All-through");
  const secondary = nearestOf(schools, (s) => s.phase === "Secondary" || s.phase === "All-through");
  if (!primary && !secondary) return null;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Likely catchment schools</h2>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          Estimate
        </span>
      </header>
      <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">
        Nearest mainstream state school of each phase, by straight-line distance from this point.
      </p>
      <ul className="space-y-1.5">
        <Row label="Primary" school={primary} onSelect={onSelect} />
        <Row label="Secondary" school={secondary} onSelect={onSelect} />
      </ul>
      <p className="mt-3 rounded-lg bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900">
        <strong>This is a distance estimate, not a real catchment.</strong> It is <em>not</em> based on
        where a school’s pupils actually live (that needs restricted pupil data we can’t use). Real
        admission depends on each school’s own criteria — siblings, faith, aptitude — and the true “last
        distance offered” changes every year and is often <em>much smaller</em> in popular areas.
        Selective (grammar), faith and independent schools don’t admit purely by distance. Always check
        the school’s published admissions policy and your local council before relying on this.
      </p>
    </section>
  );
}
