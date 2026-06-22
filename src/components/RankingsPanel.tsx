import { AreaReport } from "@/lib/types";
import { gradeRank } from "@/lib/reportCard";
import { pctColor } from "@/lib/scoreColors";

// Consolidated "how this area ranks nationally" summary, reusing the benchmarks/facts/schools already
// in the area report (no extra fetch). Each row is shown as a 0–100 score where higher = better, so
// they read consistently; property price is left neutral (pricier isn't inherently good or bad).
export default function RankingsPanel({ report }: { report: AreaReport }) {
  const rated = report.schools.filter((s) => gradeRank(s.reportCard, s.ofsted) <= 8);
  const goodPlus = rated.filter((s) => gradeRank(s.reportCard, s.ofsted) <= 4).length;
  const schoolsPct = rated.length ? Math.round((goodPlus / rated.length) * 100) : null;

  const crimePct = report.benchmarks.crime?.percentile ?? null; // higher = more crime
  const pricePct = report.benchmarks.price?.percentile ?? null; // higher = pricier
  const decile = report.facts.imdDecile ?? null; // 1 = most deprived, 10 = least

  const rows: Row[] = [
    {
      label: "Schools rated good or better",
      value: schoolsPct == null ? null : `${schoolsPct}%`,
      score: schoolsPct,
      neutral: false,
    },
    {
      label: "Safety vs other areas",
      value: crimePct == null ? null : `safer than ${100 - crimePct}%`,
      score: crimePct == null ? null : 100 - crimePct,
      neutral: false,
    },
    {
      label: "Deprivation (IMD)",
      value: decile == null ? null : `${decile}/10`,
      score: decile == null ? null : decile * 10,
      neutral: false,
    },
    {
      label: "Property prices",
      value: pricePct == null ? null : `pricier than ${pricePct}%`,
      score: pricePct,
      neutral: true, // context only
    },
  ];

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">Area rankings</h2>
      <p className="mt-0.5 text-xs text-[var(--muted)]">How this area ranks nationally</p>
      <dl className="mt-3 space-y-3">
        {rows.map((r) => {
          const color = r.score == null || r.neutral ? "#94a3b8" : pctColor(r.score);
          return (
            <div key={r.label}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <dt className="text-[var(--muted)]">{r.label}</dt>
                <dd className="font-semibold" style={r.neutral ? undefined : { color }}>
                  {r.value ?? "—"}
                </dd>
              </div>
              {r.score != null && (
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-1.5 rounded-full"
                    style={{ width: `${Math.max(4, Math.min(100, r.score))}%`, backgroundColor: color }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        National context from our benchmark sample (crime, price) and IMD 2019 (deprivation). Schools =
        share of rated schools within {report.radiusMiles} mile graded good / Expected standard or better.
      </p>
    </section>
  );
}

interface Row {
  label: string;
  value: string | null;
  score: number | null; // 0–100, higher = better (drives the bar + colour)
  neutral: boolean;
}
