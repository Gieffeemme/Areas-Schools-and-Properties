import { AreaFacts } from "@/lib/types";
import { scotlandCrimeSourceUrl } from "@/lib/sources";
import SourceLink from "./SourceLink";

// Scotland has no street-level crime on police.uk, so this is council-area recorded crime (rate per
// 10,000), shown vs the Scottish average. Deliberately framed as area-level, not point-level.
export default function ScotlandCrimePanel({ facts }: { facts: AreaFacts }) {
  const c = facts.scotlandCrime;
  if (!c) return null;
  const diff = Math.round(((c.rate - c.scotlandRate) / c.scotlandRate) * 100);
  const cmp =
    diff === 0 ? "in line with the Scottish average" : `${Math.abs(diff)}% ${diff > 0 ? "above" : "below"} the Scottish average`;
  const cmpColor = diff >= 10 ? "#dc2626" : diff <= -10 ? "#16a34a" : "#64748b";
  const maxRate = Math.max(1, ...c.groups.map((g) => g.rate ?? 0));

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Recorded crime</h2>
        <span className="text-xs text-[var(--muted)]">{c.laName}</span>
      </header>
      <div className="mb-3 flex items-baseline gap-2">
        <span className="text-2xl font-bold leading-none tabular-nums">{c.rate.toLocaleString("en-GB")}</span>
        <span className="text-xs text-[var(--muted)]">crimes per 10,000 people · {c.year}</span>
      </div>
      <p className="mb-3 text-xs font-medium" style={{ color: cmpColor }}>
        {cmp} ({c.scotlandRate.toLocaleString("en-GB")} per 10,000)
      </p>
      <ul className="space-y-2">
        {c.groups.map((g) => (
          <li key={g.key} className="flex items-center gap-2 text-xs">
            <span className="w-36 shrink-0 text-[var(--muted)]">{g.label}</span>
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
              {g.rate != null && (
                <div className="h-full rounded-full bg-[#64748b]" style={{ width: `${(g.rate / maxRate) * 100}%` }} />
              )}
            </div>
            <span className="w-9 shrink-0 text-right font-semibold tabular-nums">{g.rate ?? "-"}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Council-area totals, not street-level — Police Scotland isn’t on police.uk. Rate is crimes per
        10,000 residents (the five crime groups). Source:{" "}
        <SourceLink href={scotlandCrimeSourceUrl()}>Scottish Government — Recorded Crime</SourceLink>.
      </p>
    </section>
  );
}
