import { OfstedRating, School } from "@/lib/types";
import { RATING_COLORS } from "@/lib/ratings";
import Pill from "./Pill";

const OFSTED_SHORT: Record<OfstedRating, string> = {
  Outstanding: "Outstanding",
  Good: "Good",
  "Requires improvement": "RI",
  Inadequate: "Inadequate",
  "Not rated": "Not rated",
  "Not loaded": "—",
};

// green = good · amber = caution · red = bad
function p8Color(v: number): string {
  return v >= 0 ? "#16a34a" : v >= -0.5 ? "#d97706" : "#dc2626";
}
function happyColor(pct: number): string {
  return pct >= 85 ? "#16a34a" : pct >= 65 ? "#d97706" : "#dc2626";
}

export default function SchoolCard({ school: s }: { school: School }) {
  const color = RATING_COLORS[s.ofsted];
  const year = s.ofstedDate ? Number(s.ofstedDate.slice(0, 4)) : null;
  const stale = year != null && new Date().getFullYear() - year > 4;

  return (
    <div
      className="rounded-lg border border-l-4 border-[var(--border)] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ borderLeftColor: color }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-[15px] font-semibold leading-tight">{s.name}</p>
        <span className="shrink-0 text-xs text-[var(--muted)]">{s.distanceMiles} mi</span>
      </div>

      <p className="mt-0.5 text-xs text-[var(--muted)]">
        {s.phase ?? "School"}
        {year != null && (
          <>
            {" · "}
            <span className={stale ? "font-medium text-[#d97706]" : ""}>Ofsted {year}</span>
          </>
        )}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Pill color={color} title={`Ofsted: ${s.ofsted}`}>
          {OFSTED_SHORT[s.ofsted] ?? s.ofsted}
        </Pill>
        {typeof s.progress8 === "number" && (
          <Pill color={p8Color(s.progress8)} title={`Progress 8${s.ks4Year ? ` (${s.ks4Year})` : ""}`}>
            P8 {s.progress8 > 0 ? "+" : ""}
            {s.progress8.toFixed(2)}
          </Pill>
        )}
        {typeof s.parentViewHappy === "number" && (
          <Pill
            color={happyColor(s.parentViewHappy)}
            title={`Parent View happiness${s.parentViewResponses != null ? ` (${s.parentViewResponses} responses)` : ""}`}
          >
            {s.parentViewHappy}%
          </Pill>
        )}
      </div>
    </div>
  );
}
