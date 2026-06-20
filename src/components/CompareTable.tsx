import { AreaReport, OfstedRating } from "@/lib/types";
import { gbp, num } from "@/lib/format";
import RatingBadge from "./RatingBadge";

export interface CompareRow {
  pc: string;
  report: AreaReport | null;
  error: string | null;
}

const OFSTED_ORDER: OfstedRating[] = ["Outstanding", "Good", "Requires improvement", "Inadequate"];

export default function CompareTable({ rows }: { rows: CompareRow[] }) {
  const ok = rows.filter((r): r is CompareRow & { report: AreaReport } => !!r.report);
  const failed = rows.filter((r) => !r.report);

  if (ok.length === 0) {
    return <p className="mt-6 text-sm text-red-700">None of those postcodes returned data.</p>;
  }

  const reports = ok.map((r) => r.report);
  const schoolsBest = argbest(reports.map((r) => r.schools.length), "max");
  const crimeBest = argbest(reports.map((r) => (r.crime && r.crime.month ? r.crime.total : null)), "min");
  const priceBest = argbest(reports.map((r) => r.prices?.averagePrice ?? null), "min");
  const deprBest = argbest(reports.map((r) => r.facts.imdDecile ?? null), "max");

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-[var(--background)] p-3" />
            {ok.map((r) => (
              <th
                key={r.pc}
                className="border-b border-[var(--border)] p-3 text-left align-bottom"
              >
                <div className="font-bold">{r.report.facts.postcode}</div>
                <div className="text-xs font-normal text-[var(--muted)]">
                  {r.report.facts.district}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <MetricRow label="Schools within 1 mile">
            {reports.map((r, i) => (
              <Td key={i} best={i === schoolsBest}>
                {num(r.schools.length)}
              </Td>
            ))}
          </MetricRow>

          <MetricRow label="Best Ofsted nearby">
            {reports.map((r, i) => {
              const top = bestOfsted(r);
              return (
                <Td key={i}>
                  {top ? <RatingBadge rating={top} small /> : <Muted />}
                </Td>
              );
            })}
          </MetricRow>

          <MetricRow label="Crime (last month, ~1 mi)">
            {reports.map((r, i) => (
              <Td key={i} best={i === crimeBest}>
                {r.crime && r.crime.month ? (
                  <>
                    {num(r.crime.total)}
                    {r.benchmarks.crime && (
                      <span className="block text-xs font-normal text-[var(--muted)]">
                        {r.benchmarks.crime.percentile}th pct nationally
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-[var(--muted)]">no data</span>
                )}
              </Td>
            ))}
          </MetricRow>

          <MetricRow label="Avg sold price">
            {reports.map((r, i) => (
              <Td key={i} best={i === priceBest} bestLabel="cheapest">
                {r.prices?.averagePrice != null ? (
                  <>
                    {gbp(r.prices.averagePrice)}
                    {r.benchmarks.price && (
                      <span className="block text-xs font-normal text-[var(--muted)]">
                        {r.benchmarks.price.percentile}th pct nationally
                      </span>
                    )}
                  </>
                ) : (
                  <Muted />
                )}
              </Td>
            ))}
          </MetricRow>

          <MetricRow label="Deprivation (IMD decile)">
            {reports.map((r, i) => (
              <Td key={i} best={i === deprBest}>
                {r.facts.imdDecile != null ? `${r.facts.imdDecile}/10` : <Muted />}
              </Td>
            ))}
          </MetricRow>
        </tbody>
      </table>

      {failed.length > 0 && (
        <p className="mt-3 text-xs text-amber-700">
          Couldn’t load: {failed.map((f) => f.pc).join(", ")}.
        </p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Green = strongest in the row (most schools, least crime, cheapest, least deprived). “pct”
        is the national percentile. Ofsted needs <code className="font-mono">npm run etl:schools</code>;
        percentiles need <code className="font-mono">npm run etl:benchmarks</code>.
      </p>
    </div>
  );
}

function MetricRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <th className="sticky left-0 z-10 border-b border-[var(--border)] bg-[var(--background)] p-3 text-left text-xs font-medium text-[var(--muted)]">
        {label}
      </th>
      {children}
    </tr>
  );
}

function Td({
  children,
  best,
  bestLabel,
}: {
  children: React.ReactNode;
  best?: boolean;
  bestLabel?: string;
}) {
  return (
    <td
      className={`border-b border-[var(--border)] p-3 align-top ${best ? "bg-emerald-50" : "bg-white"}`}
    >
      <div className="font-semibold">{children}</div>
      {best && (
        <span className="mt-1 inline-block rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
          {bestLabel || "best"}
        </span>
      )}
    </td>
  );
}

function Muted() {
  return <span className="text-[var(--muted)]">—</span>;
}

function bestOfsted(r: AreaReport): OfstedRating | null {
  for (const rating of OFSTED_ORDER) {
    if (r.schools.some((s) => s.ofsted === rating)) return rating;
  }
  return null;
}

function argbest(vals: (number | null)[], dir: "min" | "max"): number {
  let best = -1;
  let bestVal = dir === "min" ? Infinity : -Infinity;
  vals.forEach((v, i) => {
    if (v == null) return;
    if ((dir === "min" && v < bestVal) || (dir === "max" && v > bestVal)) {
      bestVal = v;
      best = i;
    }
  });
  return best;
}
