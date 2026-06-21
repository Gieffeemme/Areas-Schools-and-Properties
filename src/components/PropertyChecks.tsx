"use client";

import { useEffect, useState } from "react";
import { FloodSummary, LatLng } from "@/lib/types";
import Card from "./Card";

type Check = { label: string; status: "live" | "soon"; note: string };

export default function PropertyChecks({ centre }: { centre: LatLng }) {
  const [flood, setFlood] = useState<FloodSummary | null | "loading">("loading");

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

  const checks: Check[] = [
    floodCheck(flood),
    { label: "Sold price history", status: "live", note: "HM Land Registry — see the prices panel" },
    { label: "EPC & energy cost", status: "soon", note: "MHCLG EPC register" },
    { label: "Tenure (freehold / leasehold)", status: "soon", note: "HM Land Registry" },
    { label: "Council tax band", status: "soon", note: "VOA" },
    { label: "Planning applications nearby", status: "soon", note: "Local authority" },
  ];

  return (
    <Card title="Property checks" subtitle="Due diligence for a specific address">
      <ul className="space-y-2">
        {checks.map((c) => (
          <li key={c.label} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{c.label}</p>
              <p className="text-[11px] text-[var(--muted)]">{c.note}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
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
        Flood risk is live from the Environment Agency. “Soon” checks arrive with their data
        pipelines.
      </p>
    </Card>
  );
}

function floodCheck(flood: FloodSummary | null | "loading"): Check {
  if (flood === "loading") {
    return { label: "Flood risk", status: "soon", note: "Environment Agency — checking…" };
  }
  if (!flood) {
    return { label: "Flood risk", status: "soon", note: "Environment Agency — temporarily unavailable" };
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
  return { label: "Flood risk", status: "live", note: `Environment Agency — ${where}${name}${active}` };
}

function truncate(s: string): string {
  return s.length > 52 ? `${s.slice(0, 51)}…` : s;
}
