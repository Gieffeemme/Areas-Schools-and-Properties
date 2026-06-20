import { CrimeSummary, MetricBenchmark } from "@/lib/types";
import { monthLabel, num } from "@/lib/format";

const WRAP = "rounded-2xl bg-[var(--crime)] p-4 text-white shadow-sm";

export default function CrimePanel({
  crime,
  benchmark,
}: {
  crime: CrimeSummary | null;
  benchmark?: MetricBenchmark | null;
}) {
  if (!crime) {
    return (
      <div className={WRAP}>
        <Head />
        <p className="mt-2 text-sm text-white/60">police.uk data is temporarily unavailable.</p>
      </div>
    );
  }

  if (!crime.month && crime.total === 0) {
    return (
      <div className={WRAP}>
        <Head sub="Within ~1 mile" />
        <p className="mt-2 text-sm text-white/60">
          No police.uk crime data is published for this area — some forces (e.g. Greater Manchester)
          don’t supply street-level data.
        </p>
      </div>
    );
  }

  const { label, color } = benchmark
    ? pctBand(benchmark.percentile)
    : ratioBand(crime.ratioToNational);
  const max = crime.byCategory[0]?.count ?? 1;

  return (
    <div className={WRAP}>
      <Head sub={`Within ~1 mile · ${monthLabel(crime.month)}`} />

      <div className="mt-3 flex items-stretch justify-between gap-3">
        <div className="flex flex-col justify-center">
          <p className="text-3xl font-bold leading-none">{num(crime.total)}</p>
          <p className="mt-1 text-xs text-white/55">recorded incidents</p>
        </div>
        <div
          className="flex flex-col items-center justify-center rounded-xl px-4 py-2"
          style={{ backgroundColor: `${color}26` }}
        >
          <span className="text-2xl font-bold leading-none" style={{ color }}>
            {benchmark ? benchmark.percentile : crime.ratioToNational}
            <span className="text-base">{benchmark ? "th" : "×"}</span>
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-white/55">
            {benchmark ? "percentile" : "vs avg"}
          </span>
        </div>
      </div>
      <p className="mt-2 text-xs" style={{ color }}>
        {label}
      </p>

      <div className="mt-4 space-y-2">
        {crime.byCategory.slice(0, 5).map((c) => (
          <div key={c.category}>
            <div className="flex justify-between text-xs text-white/70">
              <span>{c.category}</span>
              <span className="text-white/45">{c.count}</span>
            </div>
            <div className="mt-1 h-1 w-full rounded-full bg-white/10">
              <div
                className="h-1 rounded-full"
                style={{ width: `${(c.count / max) * 100}%`, backgroundColor: "#818cf8" }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-white/40">
        Source: police.uk street-level crime (latest month).{" "}
        {benchmark
          ? `Percentile vs a sample of ${benchmark.sampleSize} English areas.`
          : "“Avg” ≈ a typical UK populated area (~120/mo)."}
      </p>
    </div>
  );
}

function Head({ sub }: { sub?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-semibold tracking-tight">Crime</h2>
      {sub && <span className="text-xs text-white/45">{sub}</span>}
    </div>
  );
}

function pctBand(p: number): { label: string; color: string } {
  if (p < 33) return { label: "lower than most areas", color: "#22c55e" };
  if (p < 66) return { label: "mid-range", color: "#cbd5e1" };
  if (p < 85) return { label: "higher than most areas", color: "#fbbf24" };
  return { label: "among the highest", color: "#f87171" };
}

function ratioBand(r: number): { label: string; color: string } {
  if (r < 0.75) return { label: "below average", color: "#22c55e" };
  if (r <= 1.25) return { label: "around average", color: "#cbd5e1" };
  if (r <= 2) return { label: "above average", color: "#fbbf24" };
  return { label: "well above average", color: "#f87171" };
}
