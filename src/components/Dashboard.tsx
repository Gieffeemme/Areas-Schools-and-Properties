"use client";

import { useCallback, useState } from "react";
import PostcodeSearch from "./PostcodeSearch";
import AreaMap from "./AreaMap";
import SchoolsPanel from "./SchoolsPanel";
import CrimePanel from "./CrimePanel";
import PricePanel from "./PricePanel";
import { RATING_COLORS } from "@/lib/ratings";
import { AreaReport, OfstedRating, SourceError } from "@/lib/types";

export default function Dashboard() {
  const [report, setReport] = useState<AreaReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (postcode: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/area?postcode=${encodeURIComponent(postcode)}&radius=1`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  if (!report && !loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:py-24">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Know an area before you move
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-[var(--muted)]">
            Enter a UK postcode and see the schools, crime, and property prices around it — in one
            place, from free and open data. No login.
          </p>
        </div>
        <div className="mx-auto mt-8 max-w-xl">
          <PostcodeSearch onSearch={search} loading={loading} large />
        </div>
        {error && <Banner>{error}</Banner>}
        <div className="mx-auto mt-10 grid max-w-xl grid-cols-3 gap-3 text-center text-xs">
          <Feature emoji="🎓" label="Schools & Ofsted" />
          <Feature emoji="🛡️" label="Crime vs average" />
          <Feature emoji="🏠" label="Sold prices" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 max-w-xl">
        <PostcodeSearch onSearch={search} loading={loading} />
      </div>
      {error && <Banner>{error}</Banner>}
      {loading && <Skeleton />}
      {report && !loading && <Report report={report} />}
    </div>
  );
}

function Report({ report }: { report: AreaReport }) {
  const f = report.facts;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{f.postcode}</h1>
        {(f.district || f.region) && (
          <span className="text-[var(--muted)]">
            {[f.district, f.region].filter(Boolean).join(", ")}
          </span>
        )}
        {typeof f.imdDecile === "number" && <Chip>{imdLabel(f.imdDecile)}</Chip>}
        {f.constituency && <Chip subtle>{f.constituency}</Chip>}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <div className="h-[420px] overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm sm:h-[520px] lg:h-[640px]">
            <AreaMap
              key={`${report.centre.lat},${report.centre.lng}`}
              centre={report.centre}
              schools={report.schools}
              radiusMiles={report.radiusMiles}
            />
          </div>
          <Legend />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <SchoolsPanel
            schools={report.schools}
            radiusMiles={report.radiusMiles}
            ofstedLoaded={report.ofstedLoaded}
          />
          <CrimePanel crime={report.crime} />
          <PricePanel prices={report.prices} />
        </div>
      </div>

      {report.errors.length > 0 && <PartialNote errors={report.errors} />}

      <p className="mt-4 text-xs text-[var(--muted)]">
        The shaded circle is a <strong>1-mile distance guide</strong>, not a school catchment
        boundary. Catchment areas are a later phase.
      </p>
    </div>
  );
}

function Feature({ emoji, label }: { emoji: string; label: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-3 shadow-sm">
      <div className="text-lg">{emoji}</div>
      <div className="mt-1 font-medium">{label}</div>
    </div>
  );
}

function Chip({ children, subtle = false }: { children: React.ReactNode; subtle?: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        subtle ? "bg-slate-100 text-[var(--muted)]" : "bg-indigo-50 text-[var(--primary)]"
      }`}
    >
      {children}
    </span>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="grid animate-pulse gap-4 lg:grid-cols-5">
      <div className="h-[420px] rounded-2xl bg-slate-200 sm:h-[520px] lg:col-span-3 lg:h-[640px]" />
      <div className="space-y-4 lg:col-span-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-40 rounded-2xl bg-slate-200" />
        ))}
      </div>
    </div>
  );
}

const LEGEND: { rating: OfstedRating; label: string }[] = [
  { rating: "Outstanding", label: "Outstanding" },
  { rating: "Good", label: "Good" },
  { rating: "Requires improvement", label: "Requires improvement" },
  { rating: "Inadequate", label: "Inadequate" },
  { rating: "Not loaded", label: "Rating not loaded" },
];

function Legend() {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-[11px] text-[var(--muted)]">
      <span className="font-medium">Schools:</span>
      {LEGEND.map((l) => (
        <span key={l.label} className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: RATING_COLORS[l.rating] }}
          />
          {l.label}
        </span>
      ))}
    </div>
  );
}

function PartialNote({ errors }: { errors: SourceError[] }) {
  return (
    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      Some data couldn’t load just now: {errors.map((e) => e.source).join(", ")}. Showing what we
      have.
    </div>
  );
}

function imdLabel(decile: number): string {
  const tag = decile <= 3 ? "more deprived" : decile >= 8 ? "less deprived" : "around average";
  return `IMD decile ${decile}/10 · ${tag}`;
}
