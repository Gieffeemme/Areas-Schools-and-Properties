"use client";

import { useCallback, useState } from "react";
import PostcodeSearch from "./PostcodeSearch";
import AreaMap from "./AreaMap";
import SchoolsPanel from "./SchoolsPanel";
import CrimePanel from "./CrimePanel";
import PricePanel from "./PricePanel";
import PropertyChecks from "./PropertyChecks";
import RouteSelector from "./RouteSelector";
import SchoolDetail from "./SchoolDetail";
import { RATING_COLORS } from "@/lib/ratings";
import { DEFAULT_ROUTE, Route, routeDef } from "@/lib/routes";
import { AreaReport, OfstedRating, School, SourceError } from "@/lib/types";

export default function Dashboard() {
  const [route, setRoute] = useState<Route>(DEFAULT_ROUTE);
  const [report, setReport] = useState<AreaReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<School | null>(null);
  const [radius, setRadius] = useState(1);
  const [lastQuery, setLastQuery] = useState<string | null>(null);

  const run = useCallback(async (postcode: string, r: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/area?postcode=${encodeURIComponent(postcode)}&radius=${r}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setReport(data);
      setLastQuery(postcode);
      setRadius(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const search = (postcode: string) => run(postcode, radius);
  const changeRadius = (r: number) => (lastQuery ? run(lastQuery, r) : setRadius(r));

  if (!report && !loading) {
    const def = routeDef(route);
    return (
      <div className="mx-auto max-w-3xl px-4 py-14 sm:py-20">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{def.headline}</h1>
          <p className="mx-auto mt-3 max-w-xl text-[var(--muted)]">{def.sub}</p>
        </div>

        <p className="mt-8 mb-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          What are you trying to do?
        </p>
        <RouteSelector value={route} onChange={setRoute} variant="cards" />

        <div className="mx-auto mt-6 max-w-xl">
          <PostcodeSearch onSearch={search} loading={loading} large />
        </div>
        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          or{" "}
          <a href="/compare" className="font-medium text-[var(--primary)] hover:underline">
            compare several areas side by side →
          </a>
        </p>
        {error && <Banner>{error}</Banner>}
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
      {report && !loading && (
        <Report
          report={report}
          route={route}
          onRoute={setRoute}
          onSelect={setSelected}
          onRadius={changeRadius}
        />
      )}
      {selected && <SchoolDetail school={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function Report({
  report,
  route,
  onRoute,
  onSelect,
  onRadius,
}: {
  report: AreaReport;
  route: Route;
  onRoute: (r: Route) => void;
  onSelect: (s: School) => void;
  onRadius: (r: number) => void;
}) {
  const f = report.facts;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{f.postcode}</h1>
            {(f.district || f.region) && (
              <span className="text-[var(--muted)]">
                {[f.district, f.region].filter(Boolean).join(", ")}
              </span>
            )}
            {typeof f.imdDecile === "number" && <Chip>{imdLabel(f.imdDecile)}</Chip>}
          </div>
          <a
            href={`/compare?postcodes=${encodeURIComponent(f.postcode)}`}
            className="mt-1 inline-block text-sm font-medium text-[var(--primary)] hover:underline"
          >
            Compare with another area →
          </a>
        </div>
        <RouteSelector value={route} onChange={onRoute} variant="tabs" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-xs font-medium text-[var(--muted)]">Show area within</span>
        <RadiusSelector value={report.radiusMiles} onChange={onRadius} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <div>
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

        <div className="space-y-4">
          <SidePanels report={report} route={route} onSelect={onSelect} />
        </div>
      </div>

      {report.errors.length > 0 && <PartialNote errors={report.errors} />}

      <p className="mt-4 text-xs text-[var(--muted)]">
        The shaded circle is a{" "}
        <strong>{report.radiusMiles === 0.5 ? "½" : report.radiusMiles}-mile distance guide</strong>,
        not a school catchment boundary. Catchment areas are a later phase.
      </p>
    </div>
  );
}

// Panel order/emphasis tailored to the chosen route (all data shared).
function SidePanels({
  report,
  route,
  onSelect,
}: {
  report: AreaReport;
  route: Route;
  onSelect: (s: School) => void;
}) {
  const schools = (
    <SchoolsPanel
      schools={report.schools}
      radiusMiles={report.radiusMiles}
      ofstedLoaded={report.ofstedLoaded}
      onSelect={onSelect}
    />
  );
  const crime = <CrimePanel crime={report.crime} benchmark={report.benchmarks.crime} />;
  const price = <PricePanel prices={report.prices} benchmark={report.benchmarks.price} />;

  if (route === "property") {
    return (
      <>
        {price}
        <PropertyChecks centre={report.centre} />
        {crime}
        {schools}
      </>
    );
  }

  if (route === "school") {
    return (
      <>
        {schools}
        <a
          href="/map"
          className="block rounded-2xl border border-dashed border-[var(--border)] bg-white p-3 text-center text-sm font-medium text-[var(--primary)] shadow-sm transition hover:border-[var(--primary)]"
        >
          See these schools on the map →
        </a>
        {crime}
        {price}
      </>
    );
  }

  // area
  return (
    <>
      {schools}
      {crime}
      {price}
    </>
  );
}

const RADII = [0.5, 1, 2, 3, 5];
function RadiusSelector({ value, onChange }: { value: number; onChange: (r: number) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-[var(--border)] bg-white text-xs">
      {RADII.map((r) => (
        <button
          key={r}
          onClick={() => onChange(r)}
          className={`px-2.5 py-1 transition ${
            r === value
              ? "bg-[var(--primary)] font-semibold text-white"
              : "text-[var(--muted)] hover:bg-slate-50"
          }`}
        >
          {r === 0.5 ? "½" : r} mi
        </button>
      ))}
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
    <div className="grid animate-pulse gap-4 lg:grid-cols-[3fr_2fr]">
      <div className="h-[420px] rounded-2xl bg-slate-200 sm:h-[520px] lg:h-[640px]" />
      <div className="space-y-4">
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
  { rating: "Not rated", label: "Not rated" },
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
