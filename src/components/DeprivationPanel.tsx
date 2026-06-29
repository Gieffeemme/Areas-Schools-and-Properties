import { AreaFacts, ImdDomains, WimdDomains, SimdDomains, NimdmDomains } from "@/lib/types";
import { imdSourceUrl, wimdSourceUrl, simdSourceUrl, nimdmSourceUrl } from "@/lib/sources";
import SourceLink from "./SourceLink";

const IMD_DOMAINS: { key: keyof ImdDomains; label: string }[] = [
  { key: "income", label: "Income" },
  { key: "employment", label: "Employment" },
  { key: "education", label: "Education & skills" },
  { key: "health", label: "Health" },
  { key: "crime", label: "Crime" },
  { key: "housing", label: "Housing & access" },
  { key: "living", label: "Living environment" },
];

const WIMD_DOMAINS: { key: keyof WimdDomains; label: string }[] = [
  { key: "income", label: "Income" },
  { key: "employment", label: "Employment" },
  { key: "health", label: "Health" },
  { key: "education", label: "Education" },
  { key: "access", label: "Access to services" },
  { key: "housing", label: "Housing" },
  { key: "community", label: "Community safety" },
  { key: "physical", label: "Physical environment" },
];

const SIMD_DOMAINS: { key: keyof SimdDomains; label: string }[] = [
  { key: "income", label: "Income" },
  { key: "employment", label: "Employment" },
  { key: "education", label: "Education & skills" },
  { key: "health", label: "Health" },
  { key: "crime", label: "Crime" },
  { key: "housing", label: "Housing" },
  { key: "access", label: "Access to services" },
];

const NIMDM_DOMAINS: { key: keyof NimdmDomains; label: string }[] = [
  { key: "income", label: "Income" },
  { key: "employment", label: "Employment" },
  { key: "education", label: "Education & skills" },
  { key: "health", label: "Health" },
  { key: "crime", label: "Crime & disorder" },
  { key: "living", label: "Living environment" },
  { key: "access", label: "Access to services" },
];

// Decile 1 = most deprived (red) … 10 = least deprived (green).
function decileColor(d: number): string {
  if (d <= 2) return "#dc2626";
  if (d <= 4) return "#f97316";
  if (d <= 6) return "#eab308";
  if (d <= 8) return "#84cc16";
  return "#16a34a";
}

function DomainBars<T>({ domains, rows }: { domains: T; rows: { key: keyof T; label: string }[] }) {
  return (
    <ul className="space-y-2">
      {rows.map(({ key, label }) => {
        const d = domains[key] as number | null;
        return (
          <li key={String(key)} className="flex items-center gap-2 text-xs">
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
  );
}

export default function DeprivationPanel({ facts }: { facts: AreaFacts }) {
  // Northern Ireland: NI Multiple Deprivation Measure 2017 (seven domains, ranked within NI).
  if (facts.nimdm) {
    const { rank, decile, count, domains } = facts.nimdm;
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
        <header className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Deprivation (NIMDM 2017)</h2>
          <span className="text-xs text-[var(--muted)]">
            rank {rank.toLocaleString("en-GB")}/{count.toLocaleString("en-GB")} · decile {decile}/10
          </span>
        </header>
        <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">
          Decile within Northern Ireland - <strong>1</strong> = most deprived 10%, <strong>10</strong> ={" "}
          least, for this Super Output Area.
        </p>
        <DomainBars domains={domains} rows={NIMDM_DOMAINS} />
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
          Source:{" "}
          <SourceLink href={nimdmSourceUrl()}>
            NISRA - NI Multiple Deprivation Measure 2017
          </SourceLink>
          .
        </p>
      </section>
    );
  }

  // Scotland: Scottish Index of Multiple Deprivation 2020v2 (seven domains, ranked within Scotland).
  if (facts.simd) {
    const { rank, decile, count, domains } = facts.simd;
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
        <header className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Deprivation (SIMD 2020)</h2>
          <span className="text-xs text-[var(--muted)]">
            rank {rank.toLocaleString("en-GB")}/{count.toLocaleString("en-GB")} · decile {decile}/10
          </span>
        </header>
        <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">
          Decile within Scotland - <strong>1</strong> = most deprived 10%, <strong>10</strong> = least,
          for this data zone.
        </p>
        <DomainBars domains={domains} rows={SIMD_DOMAINS} />
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
          Source:{" "}
          <SourceLink href={simdSourceUrl()}>
            Scottish Government - Scottish Index of Multiple Deprivation 2020
          </SourceLink>
          .
        </p>
      </section>
    );
  }

  // Wales: Welsh Index of Multiple Deprivation 2025 (eight domains, ranked within Wales).
  if (facts.wimd) {
    const { rank, decile, count, domains } = facts.wimd;
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
        <header className="mb-1 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight">Deprivation (WIMD 2025)</h2>
          <span className="text-xs text-[var(--muted)]">
            rank {rank.toLocaleString("en-GB")}/{count.toLocaleString("en-GB")} · decile {decile}/10
          </span>
        </header>
        <p className="mb-3 text-[11px] leading-snug text-[var(--muted)]">
          Decile within Wales - <strong>1</strong> = most deprived 10%, <strong>10</strong> = least,
          for this LSOA neighbourhood.
        </p>
        <DomainBars domains={domains} rows={WIMD_DOMAINS} />
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
          Source:{" "}
          <SourceLink href={wimdSourceUrl()}>
            Welsh Government - Welsh Index of Multiple Deprivation 2025
          </SourceLink>
          .
        </p>
      </section>
    );
  }

  // England: Indices of Deprivation 2019 (seven domains).
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
      <DomainBars domains={dom} rows={IMD_DOMAINS} />
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Source: <SourceLink href={imdSourceUrl()}>MHCLG English Indices of Deprivation 2019</SourceLink>.
      </p>
    </section>
  );
}
