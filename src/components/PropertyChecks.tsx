"use client";

import { useEffect, useState } from "react";
import { CouncilTaxSummary, EpcSummary, FloodSummary, LatLng, PriceSummary } from "@/lib/types";
import Card from "./Card";

// A row: `value` is the actual finding (shown prominently); `source` is the attribution (fine print).
// `value` is undefined for a check that has nothing to report yet (its row stays a quiet "Soon").
// `bars`, when present, is a band-share distribution rendered as a stacked bar under the value.
type BandSeg = { band: string; pct: number; bg: string; fg: string };
type Check = { label: string; status: "live" | "soon"; value?: string; source: string; bars?: BandSeg[] };

export default function PropertyChecks({
  centre,
  prices,
  postcode,
  councilTax,
}: {
  centre: LatLng;
  prices: PriceSummary | null;
  postcode?: string;
  councilTax?: CouncilTaxSummary | null;
}) {
  const [flood, setFlood] = useState<FloodSummary | null | "loading">("loading");
  const [epc, setEpc] = useState<EpcSummary | null | "loading">("loading");

  useEffect(() => {
    let on = true;
    setFlood("loading");
    fetch(`/api/flood?lat=${centre.lat}&lng=${centre.lng}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => on && setFlood(d as FloodSummary | null))
      .catch(() => on && setFlood(null));
    return () => {
      on = false;
    };
  }, [centre.lat, centre.lng]);

  useEffect(() => {
    if (!postcode) {
      setEpc(null);
      return;
    }
    let on = true;
    setEpc("loading");
    fetch(`/api/epc?postcode=${encodeURIComponent(postcode)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => on && setEpc(d as EpcSummary | null))
      .catch(() => on && setEpc(null));
    return () => {
      on = false;
    };
  }, [postcode]);

  const checks: Check[] = [
    floodCheck(flood),
    soldPriceCheck(prices),
    tenureCheck(prices),
    epcCheck(epc),
    councilTaxCheck(councilTax),
    { label: "Planning applications nearby", status: "soon", source: "Local authority" },
  ];

  return (
    <Card title="Property checks" subtitle="Due diligence for a specific address">
      <ul className="space-y-3">
        {checks.map((c) => (
          <li key={c.label} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-medium text-[var(--muted)]">{c.label}</p>
              {c.value && (
                <p className="mt-0.5 text-sm font-semibold leading-snug">{c.value}</p>
              )}
              {c.bars && c.bars.length > 0 && <BandBar segs={c.bars} />}
              <p className="mt-0.5 text-[10px] leading-tight text-[var(--muted)]">{c.source}</p>
            </div>
            <span
              className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                c.status === "live"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-[var(--muted)]"
              }`}
            >
              {c.status === "live" ? "Live" : "Soon"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Flood, sold prices, tenure, EPC and council tax draw on live or official open data
        (Environment Agency, HM Land Registry, MHCLG, VOA). Council-tax bands are the neighbourhood
        mix (the surrounding LSOA), not a single address. “Soon” checks arrive with their data
        pipelines.
      </p>
    </Card>
  );
}

const gbp = (n: number): string => "£" + Math.round(n).toLocaleString("en-GB");

// Build the "top three bands as `n unit`" string both EPC and council tax share.
function topBands(bands: Record<string, number>, unit: (band: string, n: number) => string): string {
  return Object.entries(bands)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([b, n]) => unit(b, n))
    .join(" · ");
}

// Official EPC band colours (A best → G worst) + a readable colour for the on-bar letter.
const EPC_BAND: Record<string, { bg: string; fg: string }> = {
  A: { bg: "#0c8a4f", fg: "#ffffff" },
  B: { bg: "#2f9e44", fg: "#ffffff" },
  C: { bg: "#8dce46", fg: "#1a3a08" },
  D: { bg: "#ffd400", fg: "#3a3000" },
  E: { bg: "#fcaa67", fg: "#4a2600" },
  F: { bg: "#ef8023", fg: "#ffffff" },
  G: { bg: "#e9153b", fg: "#ffffff" },
};
const epcColor = (band: string) => EPC_BAND[band] ?? { bg: "#94a3b8", fg: "#ffffff" };

// Council-tax bands have no official palette: a single-hue ramp, light A (lowest value) → dark H/I.
function ctaxColor(band: string): { bg: string; fg: string } {
  const pos = Math.max(0, Math.min(8, band.charCodeAt(0) - 65)); // A=0 … I=8
  const L = 80 - (pos / 8) * 46; // lightness 80% (A) → 34% (I)
  return { bg: `hsl(222 39% ${L}%)`, fg: L < 55 ? "#ffffff" : "#1e293b" };
}

// Turn a {band: count} map into stacked-bar segments (A → highest), each sized by its share.
function bandSegs(
  bands: Record<string, number>,
  color: (band: string) => { bg: string; fg: string },
): BandSeg[] {
  const total = Object.values(bands).reduce((a, b) => a + b, 0) || 1;
  return Object.keys(bands)
    .sort()
    .map((b) => ({ band: b, pct: (bands[b] / total) * 100, ...color(b) }))
    .filter((s) => s.pct > 0);
}

function BandBar({ segs }: { segs: BandSeg[] }) {
  return (
    <div className="mt-1.5 flex h-3 w-full overflow-hidden rounded-full" aria-hidden="true">
      {segs.map((s) => (
        <div
          key={s.band}
          title={`Band ${s.band}: ${Math.round(s.pct)}%`}
          style={{ width: `${s.pct}%`, backgroundColor: s.bg, color: s.fg }}
          className="flex items-center justify-center text-[9px] font-bold leading-none"
        >
          {s.pct >= 11 ? s.band : ""}
        </div>
      ))}
    </div>
  );
}

function epcCheck(epc: EpcSummary | null | "loading"): Check {
  if (epc === "loading")
    return { label: "EPC / energy", status: "soon", value: "Checking…", source: "MHCLG EPC register" };
  if (!epc) return { label: "EPC / energy", status: "soon", source: "MHCLG EPC register" };
  if (!epc.count)
    return {
      label: "EPC / energy",
      status: "live",
      value: "No certificate lodged for this postcode",
      source: "MHCLG EPC register",
    };
  return {
    label: "EPC / energy",
    status: "live",
    value: `Typical band ${epc.typicalBand} · ${topBands(epc.bands, (b, n) => `${n} ${b}`)}`,
    source: `MHCLG EPC register · ${epc.count} certificate${epc.count === 1 ? "" : "s"}`,
    bars: bandSegs(epc.bands, epcColor),
  };
}

function councilTaxCheck(ct: CouncilTaxSummary | null | undefined): Check {
  if (!ct || !ct.total || !ct.typicalBand) {
    return { label: "Council tax band", status: "soon", source: "VOA · England & Wales only" };
  }
  const dist = topBands(ct.bands, (b, n) => `${Math.round((n / ct.total) * 100)}% ${b}`);
  return {
    label: "Council tax band",
    status: "live",
    value: `Typical band ${ct.typicalBand} · ${dist}`,
    source: `VOA 2025 · ~${ct.total} homes in this LSOA`,
    bars: bandSegs(ct.bands, ctaxColor),
  };
}

function soldPriceCheck(prices: PriceSummary | null): Check {
  if (prices?.medianPrice) {
    return {
      label: "Sold price history",
      status: "live",
      value: `Median ${gbp(prices.medianPrice)}${prices.count ? ` · ${prices.count} sales` : ""}`,
      source: "HM Land Registry · full trend in the prices panel",
    };
  }
  return {
    label: "Sold price history",
    status: "live",
    value: "See the prices panel",
    source: "HM Land Registry",
  };
}

function tenureCheck(prices: PriceSummary | null): Check {
  const t = prices?.tenure;
  if (!t || !(t.freehold || t.leasehold)) {
    return { label: "Tenure (freehold / leasehold)", status: "soon", source: "HM Land Registry" };
  }
  const total = t.freehold + t.leasehold;
  const fhPct = Math.round((t.freehold / total) * 100);
  const lead = fhPct >= 50 ? `${fhPct}% freehold` : `${100 - fhPct}% leasehold`;
  return {
    label: "Tenure (freehold / leasehold)",
    status: "live",
    value: `${lead} · ${t.freehold} FH · ${t.leasehold} LH`,
    source: "HM Land Registry · recent sales",
  };
}

function floodCheck(flood: FloodSummary | null | "loading"): Check {
  if (flood === "loading") {
    return { label: "Flood risk", status: "soon", value: "Checking…", source: "Environment Agency" };
  }
  if (!flood) {
    return {
      label: "Flood risk",
      status: "soon",
      value: "Temporarily unavailable",
      source: "Environment Agency",
    };
  }
  const where =
    flood.status === "warning-area"
      ? "In a Flood Warning Area"
      : flood.status === "alert-area"
        ? "In a Flood Alert Area"
        : "Not in a flood warning or alert area";
  const name = flood.status !== "clear" && flood.areaName ? `: ${truncate(flood.areaName)}` : "";
  const active =
    flood.activeWarnings > 0
      ? ` · ${flood.activeWarnings} active ${(flood.topSeverity ?? "warning").toLowerCase()} now`
      : "";
  return { label: "Flood risk", status: "live", value: `${where}${name}${active}`, source: "Environment Agency" };
}

function truncate(s: string): string {
  return s.length > 52 ? `${s.slice(0, 51)}…` : s;
}
