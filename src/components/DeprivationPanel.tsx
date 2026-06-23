import { AreaFacts, ImdDomains } from "@/lib/types";
import { imdSourceUrl } from "@/lib/sources";
import SourceLink from "./SourceLink";

const DOMAINS: { key: keyof ImdDomains; label: string }[] = [
  { key: "income", label: "Income" },
  { key: "employment", label: "Employment" },
  { key: "education", label: "Education & skills" },
  { key: "health", label: "Health" },
  { key: "crime", label: "Crime" },
  { key: "housing", label: "Housing & access" },
  { key: "living", label: "Living environment" },
];

// Decile 1 = most deprived (red) … 10 = least deprived (green).
function decileColor(d: number): string {
  if (d <= 2) return "#dc2626";
  if (d <= 4) return "#f97316";
  if (d <= 6) return "#eab308";
  if (d <= 8) return "#84cc16";
  return "#16a34a";
}

export default function DeprivationPanel({ facts }: { facts: AreaFacts }) {
  const dom = facts.imdDomains;
  if (!dom) return null;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <header className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Deprivation (IMD 2019)</h2>
        {typeof facts.imdDecile === "number" && (
          <span className="text-xs text-[var(--muted)]">overall {facts.imdDecile}/10</span>
        )}
      </header>
      <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">
        Decile within England - <strong>1</strong> = most deprived 10%, <strong>10</strong> = least,
        for this LSOA neighbourhood.
      </p>
      <ul className="space-y-2">
        {DOMAINS.map(({ key, label }) => {
          const d = dom[key];
          return (
            <li key={key} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 text-[var(--muted)]">{label}</span>
              <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                {d != null && (
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${d * 10}%`, backgroundColor: decileColor(d) }}
                  />
                )}
              </div>
              <span className="w-7 shrink-0 text-right font-semibold tabular-nums">
                {d != null ? d : "-"}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Source: <SourceLink href={imdSourceUrl()}>MHCLG English Indices of Deprivation 2019</SourceLink>.
      </p>
    </section>
  );
}
