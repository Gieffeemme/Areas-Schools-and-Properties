import { CrimeSummary, MetricBenchmark } from "@/lib/types";
import { monthLabel, num } from "@/lib/format";
import Card from "./Card";

export default function CrimePanel({
  crime,
  benchmark,
}: {
  crime: CrimeSummary | null;
  benchmark?: MetricBenchmark | null;
}) {
  if (!crime) {
    return (
      <Card title="Crime">
        <p className="text-sm text-[var(--muted)]">police.uk data is temporarily unavailable.</p>
      </Card>
    );
  }

  if (!crime.month && crime.total === 0) {
    return (
      <Card title="Crime" subtitle="Within ~1 mile">
        <p className="text-sm text-[var(--muted)]">
          No police.uk crime data is published for this area. Some forces — notably Greater
          Manchester — don’t currently supply street-level data to police.uk.
        </p>
      </Card>
    );
  }

  const max = crime.byCategory[0]?.count ?? 1;
  const band = benchmark ? pctBand(benchmark.percentile) : ratioBand(crime.ratioToNational);

  return (
    <Card title="Crime" subtitle={`Within ~1 mile · ${monthLabel(crime.month)}`}>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-3xl font-bold leading-none">{num(crime.total)}</p>
          <p className="mt-1 text-xs text-[var(--muted)]">recorded incidents</p>
        </div>
        <div className="text-right">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold text-white"
            style={{ backgroundColor: band.color }}
          >
            {benchmark ? `${benchmark.percentile}th pct` : `${crime.ratioToNational}× avg`}
          </span>
          <p className="mt-1 text-xs" style={{ color: band.color }}>
            {band.label}
          </p>
        </div>
      </div>

      {benchmark && (
        <p className="mt-2 text-xs">
          More crime than <strong>{benchmark.percentile}%</strong> of English areas.
        </p>
      )}

      <div className="mt-4 space-y-2">
        {crime.byCategory.slice(0, 5).map((c) => (
          <div key={c.category}>
            <div className="flex justify-between text-xs">
              <span>{c.category}</span>
              <span className="text-[var(--muted)]">{c.count}</span>
            </div>
            <div className="mt-1 h-1.5 w-full rounded-full bg-slate-100">
              <div
                className="h-1.5 rounded-full"
                style={{ width: `${(c.count / max) * 100}%`, backgroundColor: "#6366f1" }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Source: police.uk street-level crime (latest month).{" "}
        {benchmark
          ? `Percentile vs a sample of ${benchmark.sampleSize} English areas.`
          : "“Avg” compares to a typical UK populated area (~120/mo) — approximate."}
      </p>
    </Card>
  );
}

function pctBand(p: number): { label: string; color: string } {
  if (p < 33) return { label: "lower than most areas", color: "#15803d" };
  if (p < 66) return { label: "mid-range", color: "#475569" };
  if (p < 85) return { label: "higher than most areas", color: "#d97706" };
  return { label: "among the highest", color: "#dc2626" };
}

function ratioBand(ratio: number): { label: string; color: string } {
  if (ratio < 0.75) return { label: "below average", color: "#15803d" };
  if (ratio <= 1.25) return { label: "around average", color: "#475569" };
  if (ratio <= 2) return { label: "above average", color: "#d97706" };
  return { label: "well above average", color: "#dc2626" };
}
