import { NoiseSource, NoiseSummary } from "@/lib/types";
import { noiseSourceUrl } from "@/lib/sources";
import SourceLink from "./SourceLink";

// Display bands for the modelled dB level. Breakpoints follow the standard END noise-map legend
// (55/65/75 for Lden, 50/60/70 for Lnight). A null metric is below the mapping threshold (40 dB Lden
// / 35 dB Lnight) - no significant source of that kind at this point.
type Band = { label: string; cls: string };
const LOW: Band = { label: "Low", cls: "bg-emerald-100 text-emerald-800" };
const MODERATE: Band = { label: "Moderate", cls: "bg-amber-100 text-amber-800" };
const HIGH: Band = { label: "High", cls: "bg-orange-100 text-orange-800" };
const VERY_HIGH: Band = { label: "Very high", cls: "bg-red-100 text-red-800" };

function ldenBand(db: number): Band {
  if (db >= 75) return VERY_HIGH;
  if (db >= 65) return HIGH;
  if (db >= 55) return MODERATE;
  return LOW;
}
function lnightBand(db: number): Band {
  if (db >= 70) return VERY_HIGH;
  if (db >= 60) return HIGH;
  if (db >= 50) return MODERATE;
  return LOW;
}

export default function NoisePanel({ noise }: { noise: NoiseSummary | null }) {
  if (!noise) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
        <Head />
        <p className="mt-2 text-sm text-[var(--muted)]">
          Noise data (Defra) is temporarily unavailable.
        </p>
      </section>
    );
  }

  const allQuiet =
    noise.road.lden == null &&
    noise.road.lnight == null &&
    noise.rail.lden == null &&
    noise.rail.lnight == null;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <Head sub="at this location" />
      {allQuiet ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          No significant road or rail noise is mapped here - modelled levels are below the 40 dB
          daytime / 35 dB night-time threshold.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <SourceRows title="Road traffic" src={noise.road} />
          <SourceRows title="Railways" src={noise.rail} />
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Source: <SourceLink href={noiseSourceUrl()}>Defra strategic noise mapping</SourceLink> (Round 4, {noise.year}). Modelled level at the searched
        point - Lden is the day–evening–night average, Lnight the night-time level. Areas quieter than
        40 dB (35 dB at night) aren’t mapped.
      </p>
    </section>
  );
}

function SourceRows({ title, src }: { title: string; src: NoiseSource }) {
  return (
    <div>
      <div className="text-xs font-semibold text-[var(--muted)]">{title}</div>
      <dl className="mt-1.5 space-y-1.5">
        <MetricRow label="Day–evening–night (Lden)" db={src.lden} floor={40} band={ldenBand} />
        <MetricRow label="Night (Lnight)" db={src.lnight} floor={35} band={lnightBand} />
      </dl>
    </div>
  );
}

function MetricRow({
  label,
  db,
  floor,
  band,
}: {
  label: string;
  db: number | null;
  floor: number;
  band: (db: number) => Band;
}) {
  const b = db == null ? null : band(db);
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="flex items-center gap-2">
        {db == null ? (
          <span className="text-xs text-[var(--muted)]">below {floor} dB</span>
        ) : (
          <>
            <span className="font-semibold tabular-nums">{db} dB</span>
            {b && (
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${b.cls}`}>
                {b.label}
              </span>
            )}
          </>
        )}
      </dd>
    </div>
  );
}

function Head({ sub }: { sub?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-semibold tracking-tight">Environmental noise</h2>
      {sub && <span className="text-xs text-[var(--muted)]">{sub}</span>}
    </div>
  );
}
