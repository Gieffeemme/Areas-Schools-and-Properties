import { BroadbandSummary } from "@/lib/types";
import { broadbandSourceUrl } from "@/lib/sources";
import SourceLink from "./SourceLink";

export default function BroadbandPanel({ broadband }: { broadband: BroadbandSummary | null }) {
  if (!broadband) return null; // no LA match (e.g. an outcode-only search) - hide the panel

  const rows = [
    { label: "Superfast (30+ Mbit/s)", value: broadband.superfast },
    { label: "Ultrafast", value: broadband.ultrafast },
    { label: "Full fibre", value: broadband.fullFibre },
    { label: "Gigabit-capable", value: broadband.gigabit },
  ];

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Broadband</h2>
        <span className="text-xs text-[var(--muted)]">{titleCase(broadband.laName)}</span>
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
      {broadband.belowUso != null && broadband.belowUso > 0 && (
        <p className="mt-3 text-xs text-[var(--muted)]">
          {broadband.belowUso}% of premises can’t yet get a decent connection (below the USO).
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
        Source: Ofcom Connected Nations 2024 - % of premises across {titleCase(broadband.laName)}.{" "}
        <SourceLink href={broadbandSourceUrl()}>Check a postcode</SourceLink>
      </p>
    </section>
  );
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());
}
