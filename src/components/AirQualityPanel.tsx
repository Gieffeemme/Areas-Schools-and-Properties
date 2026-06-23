import { AirQualitySummary } from "@/lib/types";
import { airQualitySourceUrl } from "@/lib/sources";
import SourceLink from "./SourceLink";

// Display bands for annual-mean background concentrations (µg/m³). Breakpoints anchor on the health
// references: NO2 — WHO 2021 guideline 10, UK legal limit 40; PM2.5 — WHO 2021 guideline 5, England's
// 2040 target 10. "Low" = within the WHO guideline.
type Band = { label: string; cls: string };
const LOW: Band = { label: "Low", cls: "bg-emerald-100 text-emerald-800" };
const MODERATE: Band = { label: "Moderate", cls: "bg-amber-100 text-amber-800" };
const ELEVATED: Band = { label: "Elevated", cls: "bg-orange-100 text-orange-800" };
const HIGH: Band = { label: "High", cls: "bg-red-100 text-red-800" };

function no2Band(v: number): Band {
  if (v > 40) return HIGH; // above the UK legal limit
  if (v > 20) return ELEVATED;
  if (v > 10) return MODERATE; // above the WHO guideline
  return LOW;
}
function pm25Band(v: number): Band {
  if (v > 20) return HIGH;
  if (v > 10) return ELEVATED; // above England's 2040 target
  if (v > 5) return MODERATE; // above the WHO guideline
  return LOW;
}

export default function AirQualityPanel({ airQuality }: { airQuality: AirQualitySummary | null }) {
  // No grid cell here (e.g. Northern Ireland) → nothing to show; the caller also guards this.
  if (!airQuality || (airQuality.no2 == null && airQuality.pm25 == null)) return null;
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight">Air quality</h2>
        <span className="text-xs text-[var(--muted)]">background, at this location</span>
      </div>
      <dl className="mt-3 space-y-1.5">
        <MetricRow label="Nitrogen dioxide (NO₂)" v={airQuality.no2} band={no2Band} />
        <MetricRow label="Fine particulates (PM2.5)" v={airQuality.pm25} band={pm25Band} />
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Source:{" "}
        <SourceLink href={airQualitySourceUrl()}>Defra background pollution maps</SourceLink> (
        {airQuality.year}, modelled annual mean on a 1 km grid). WHO 2021 guideline annual means: NO₂
        10, PM2.5 5 µg/m³; the UK legal limit for NO₂ is 40 µg/m³.
      </p>
    </section>
  );
}

function MetricRow({
  label,
  v,
  band,
}: {
  label: string;
  v: number | null;
  band: (v: number) => Band;
}) {
  if (v == null) return null;
  const b = band(v);
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="flex items-center gap-2">
        <span className="font-semibold tabular-nums">{v} µg/m³</span>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${b.cls}`}>{b.label}</span>
      </dd>
    </div>
  );
}
