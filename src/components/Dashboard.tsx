"use client";

import { useCallback, useState } from "react";
import PostcodeSearch from "./PostcodeSearch";
import AreaMap from "./AreaMap";
import SchoolsPanel from "./SchoolsPanel";
import CrimePanel from "./CrimePanel";
import PricePanel from "./PricePanel";
import DeprivationPanel from "./DeprivationPanel";
import AmenitiesPanel from "./AmenitiesPanel";
import TransportPanel from "./TransportPanel";
import RankingsPanel from "./RankingsPanel";
import BroadbandPanel from "./BroadbandPanel";
import NoisePanel from "./NoisePanel";
import PropertyChecks from "./PropertyChecks";
import PropertyExplorer from "./PropertyExplorer";
import RouteSelector from "./RouteSelector";
import SchoolDetail from "./SchoolDetail";
import SchoolControls from "./SchoolControls";
import { RATING_COLORS } from "@/lib/ratings";
import { SchoolFilters, DEFAULT_FILTERS, applyFilters } from "@/lib/schoolFilters";
import { DEFAULT_ROUTE, Route, routeDef } from "@/lib/routes";
import { AreaReport, OfstedRating, PlaceMatch, School, SchoolMatch, SourceError } from "@/lib/types";

type Query = { kind: "postcode"; value: string } | { kind: "place"; place: PlaceMatch };
// Which panels the area report shows: schools only, area only, or both.
type Focus = "schools" | "area" | "both";

export default function Dashboard() {
  const [route, setRoute] = useState<Route>(DEFAULT_ROUTE);
  const [report, setReport] = useState<AreaReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<School | null>(null);
  const [radius, setRadius] = useState(1);
  // The last query, so a radius change re-runs the same thing (postcode/place-text, or a picked place).
  const [lastQuery, setLastQuery] = useState<Query | null>(null);

  const run = useCallback(async (q: Query, r: number): Promise<AreaReport | null> => {
    setLoading(true);
    setError(null);
    try {
      const url =
        q.kind === "place"
          ? `/api/area?lat=${q.place.lat}&lng=${q.place.lng}&label=${encodeURIComponent(q.place.name)}&radius=${r}`
          : `/api/area?postcode=${encodeURIComponent(q.value)}&radius=${r}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setReport(data);
      setLastQuery(q);
      setRadius(r);
      return data as AreaReport;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setReport(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const search = (postcode: string) => run({ kind: "postcode", value: postcode }, radius);
  // Place-name search: run the area report at the picked place's centre (it carries its own coords).
  const goToPlace = (place: PlaceMatch) => run({ kind: "place", place }, radius);
  const changeRadius = (r: number) => (lastQuery ? run(lastQuery, r) : setRadius(r));
  // School-name search: run the area report at the school's postcode, then open its card.
  const goToSchool = async (m: SchoolMatch) => {
    const data = await run({ kind: "postcode", value: m.postcode }, radius);
    const hit = data?.schools.find((s) => s.id === m.id);
    if (hit) setSelected(hit);
  };

  // The "Check a property" route is its own address-led flow (postcode → pick address → property
  // report), separate from the area report machinery above.
  if (route === "property") {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6">
        <PropertyExplorer route={route} onRoute={setRoute} />
      </div>
    );
  }

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
          <PostcodeSearch
            onSearch={search}
            onPickSchool={goToSchool}
            onPickPlace={goToPlace}
            loading={loading}
            large
          />
        </div>
        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          or{" "}
          <a href="/compare" className="font-medium text-[var(--primary)] hover:underline">
            compare areas or schools side by side →
          </a>
        </p>
        {error && <Banner>{error}</Banner>}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 max-w-xl">
        <PostcodeSearch
          onSearch={search}
          onPickSchool={goToSchool}
          onPickPlace={goToPlace}
          loading={loading}
        />
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
  const [showMap, setShowMap] = useState(true);
  const [showList, setShowList] = useState(true);
  const both = showMap && showList;
  // At least one view must stay on.
  const toggleMap = () => {
    if (showMap && !showList) return;
    setShowMap((v) => !v);
  };
  const toggleList = () => {
    if (showList && !showMap) return;
    setShowList((v) => !v);
  };

  // School filters are lifted here so the map pins and the list stay in sync, and the controls can
  // show in the map-only view (where the list panel that normally hosts them is hidden).
  const [filters, setFilters] = useState<SchoolFilters>(DEFAULT_FILTERS);
  const [focus, setFocus] = useState<Focus>("both");
  const mapSchools = applyFilters(report.schools, filters);
  const filterKey = `${filters.phase}|${filters.gender}|${filters.faith}|${filters.selective}|${filters.rating}`;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold tracking-tight">{f.label ?? f.postcode}</h1>
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
            compare areas or schools side by side →
          </a>
        </div>
        <RouteSelector value={route} onChange={onRoute} variant="tabs" />
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <FocusToggle value={focus} onChange={setFocus} />
          <div className="flex items-center gap-x-2">
            <span className="text-xs font-medium text-[var(--muted)]">within</span>
            <RadiusSelector value={report.radiusMiles} onChange={onRadius} />
          </div>
        </div>
        <ViewToggle showMap={showMap} showList={showList} onMap={toggleMap} onList={toggleList} />
      </div>

      <div className={both ? "grid items-start gap-4 lg:grid-cols-[3fr_2fr]" : ""}>
        {showMap && (
          <div className={both ? "lg:sticky lg:top-4" : "flex h-[calc(100vh-9rem)] flex-col"}>
            {/* Map-only: the list panel that normally hosts the controls is hidden, so show them here. */}
            {!showList && focus !== "area" && (
              <SchoolControls
                schools={report.schools}
                filters={filters}
                onChange={setFilters}
                className="mb-2 shrink-0"
              />
            )}
            <div
              className={`relative overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm ${
                both ? "h-[420px] sm:h-[520px] lg:h-[600px]" : "min-h-0 flex-1"
              }`}
            >
              {/* key includes radius + layout + phase filter so the (mount-only) map re-fits/re-pins on change */}
              <AreaMap
                key={`${report.centre.lat},${report.centre.lng}|${report.radiusMiles}|${both ? "both" : "map"}|${filterKey}`}
                centre={report.centre}
                schools={mapSchools}
                radiusMiles={report.radiusMiles}
                onSelect={onSelect}
              />
            </div>
            <Legend />
          </div>
        )}

        {showList && (
          <div className="space-y-4">
            <SidePanels
              report={report}
              focus={focus}
              onSelect={onSelect}
              filters={filters}
              onChange={setFilters}
            />
          </div>
        )}
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
  focus,
  onSelect,
  filters,
  onChange,
}: {
  report: AreaReport;
  focus: Focus;
  onSelect: (s: School) => void;
  filters: SchoolFilters;
  onChange: (f: SchoolFilters) => void;
}) {
  const schools = (
    <SchoolsPanel
      schools={report.schools}
      radiusMiles={report.radiusMiles}
      ofstedLoaded={report.ofstedLoaded}
      onSelect={onSelect}
      filters={filters}
      onChange={onChange}
    />
  );
  const crime = <CrimePanel crime={report.crime} benchmark={report.benchmarks.crime} />;
  const price = <PricePanel prices={report.prices} benchmark={report.benchmarks.price} />;
  const deprivation = <DeprivationPanel facts={report.facts} />;
  const amenities = <AmenitiesPanel amenities={report.amenities} />;
  const transport = <TransportPanel transport={report.transport} />;
  const rankings = <RankingsPanel report={report} />;
  const broadband = <BroadbandPanel broadband={report.broadband} />;
  // Defra noise is England-only; hide the panel elsewhere (report.noise is null there because the
  // lookup was skipped, so within England a null unambiguously means the service failed).
  const noise =
    report.facts.country === "England" ? <NoisePanel noise={report.noise} /> : null;
  const propertyChecks = (
    <PropertyChecks
      centre={report.centre}
      prices={report.prices}
      postcode={report.facts.postcode}
      councilTax={report.facts.councilTax}
    />
  );

  const area = (
    <>
      {rankings}
      {crime}
      {amenities}
      {transport}
      {broadband}
      {noise}
      {deprivation}
      {price}
      {propertyChecks}
    </>
  );

  if (focus === "schools") return schools;
  if (focus === "area") return area;
  return (
    <>
      {schools}
      {area}
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

const FOCI: { id: Focus; label: string }[] = [
  { id: "schools", label: "Schools" },
  { id: "area", label: "Area" },
  { id: "both", label: "Schools + area" },
];
function FocusToggle({ value, onChange }: { value: Focus; onChange: (f: Focus) => void }) {
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-[var(--border)] bg-white text-xs">
      {FOCI.map((o, i) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
          className={`px-3 py-1.5 font-medium transition ${i > 0 ? "border-l border-[var(--border)]" : ""} ${
            value === o.id ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:bg-slate-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function ViewToggle({
  showMap,
  showList,
  onMap,
  onList,
}: {
  showMap: boolean;
  showList: boolean;
  onMap: () => void;
  onList: () => void;
}) {
  const cls = (on: boolean) =>
    `px-3 py-1.5 font-medium transition ${
      on ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:bg-slate-50"
    }`;
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-[var(--border)] bg-white text-xs">
      <button type="button" onClick={onMap} aria-pressed={showMap} className={cls(showMap)}>
        Map
      </button>
      <button
        type="button"
        onClick={onList}
        aria-pressed={showList}
        className={`border-l border-[var(--border)] ${cls(showList)}`}
      >
        List
      </button>
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
