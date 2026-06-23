import { BathingWaterSummary } from "@/lib/types";
import { bathingWaterSourceUrl } from "@/lib/sources";
import SourceLink from "./SourceLink";

// Classification colours follow the revised Bathing Water Directive grades (Excellent → Poor).
const CLS: Record<string, string> = {
  Excellent: "bg-emerald-100 text-emerald-800",
  Good: "bg-blue-100 text-blue-800",
  Sufficient: "bg-amber-100 text-amber-800",
  Poor: "bg-red-100 text-red-800",
};

export default function BathingWaterPanel({ water }: { water: BathingWaterSummary | null }) {
  if (!water) return null; // nothing within the coastal threshold → hide (inland)
  const badge = water.classification
    ? (CLS[water.classification] ?? "bg-slate-100 text-slate-700")
    : "bg-slate-100 text-slate-600";

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Bathing water</h2>
        <span className="text-xs text-[var(--muted)]">nearest designated</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold leading-snug">
          {water.name}
          <span className="font-normal text-[var(--muted)]"> · {water.distanceMiles} mi</span>
        </p>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badge}`}>
          {water.classification || "Not yet classified"}
        </span>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Latest annual classification (revised Bathing Water Directive) from the{" "}
        <SourceLink href={bathingWaterSourceUrl()}>Environment Agency</SourceLink>.
      </p>
    </section>
  );
}
