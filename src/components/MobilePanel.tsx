import { MobileSummary } from "@/lib/types";
import { mobileSourceUrl } from "@/lib/sources";
import SourceLink from "./SourceLink";

export default function MobilePanel({ mobile }: { mobile: MobileSummary | null }) {
  if (!mobile) return null; // no LA match (e.g. an outcode-only search) - hide the panel

  const rows = [
    { label: "4G indoors (any network)", value: mobile.fourGAny },
    { label: "4G indoors (all 4 networks)", value: mobile.fourGAll },
    { label: "5G outdoors (any network)", value: mobile.fiveGAny },
  ];

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Mobile coverage</h2>
        <span className="text-xs text-[var(--muted)]">{titleCase(mobile.laName)}</span>
      </div>
      <dl className="mt-3 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label}>
            <div className="flex items-baseline justify-between gap-2 text-sm">
              <dt className="text-[var(--muted)]">{r.label}</dt>
              <dd className="font-semibold tabular-nums">{r.value == null ? "-" : `${r.value}%`}</dd>
            </div>
            {r.value != null && (
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-1.5 rounded-full bg-[var(--primary)]"
                  style={{ width: `${Math.max(2, Math.min(100, r.value))}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
        Source: Ofcom Connected Nations 2024 - % of premises across {titleCase(mobile.laName)}. “All
        networks” means served by all four operators (EE, O2, Three, Vodafone).{" "}
        <SourceLink href={mobileSourceUrl()}>Check a postcode</SourceLink>
      </p>
    </section>
  );
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}
