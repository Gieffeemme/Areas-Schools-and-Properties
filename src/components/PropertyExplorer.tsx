"use client";

import { useMemo, useState } from "react";
import RouteSelector from "./RouteSelector";
import Card from "./Card";
import PropertyMap from "./PropertyMap";
import SchoolsPanel from "./SchoolsPanel";
import SchoolDetail from "./SchoolDetail";
import CrimePanel from "./CrimePanel";
import PricePanel from "./PricePanel";
import DeprivationPanel from "./DeprivationPanel";
import AmenitiesPanel from "./AmenitiesPanel";
import BroadbandPanel from "./BroadbandPanel";
import NoisePanel from "./NoisePanel";
import RankingsPanel from "./RankingsPanel";
import {
  AddressMatch,
  AreaReport,
  PriceSale,
  PropertyReport,
  School,
  TransportStation,
  TransportSummary,
} from "@/lib/types";
import { Route, routeDef } from "@/lib/routes";
import { DEFAULT_FILTERS, SchoolFilters } from "@/lib/schoolFilters";

type AddrState = AddressMatch[] | "loading" | "no-postcode" | null;
type ReportState = PropertyReport | "loading" | null;

// A UK postcode anywhere in the input, so pasting a full address (with its postcode) still works.
const POSTCODE_RE = /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i;
const norm = (s: string) => s.trim().toLowerCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();

// The "Check a property" route: enter a postcode → pick the exact address → that property's report.
export default function PropertyExplorer({
  route,
  onRoute,
}: {
  route: Route;
  onRoute: (r: Route) => void;
}) {
  const def = routeDef("property");
  const [postcode, setPostcode] = useState("");
  const [addresses, setAddresses] = useState<AddrState>(null);
  const [report, setReport] = useState<ReportState>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState(""); // narrows the address list (pre-filled from a typed street)
  const [notFound, setNotFound] = useState<string | null>(null); // typed street that isn't in the list

  async function lookupPostcode(e: React.FormEvent) {
    e.preventDefault();
    const raw = postcode.trim();
    if (!raw) return;
    setReport(null);
    setError(null);
    setNotFound(null);
    const m = raw.match(POSTCODE_RE);
    if (!m) {
      // No postcode in the input (e.g. they typed only a street name) - we can't street-search free.
      setFilter("");
      setAddresses("no-postcode");
      return;
    }
    const pc = m[0].toUpperCase().replace(/\s+/g, "").replace(/(\d[A-Z]{2})$/, " $1"); // canonical "OUT IN"
    const street = raw.slice(0, m.index ?? 0).replace(/,/g, " ").trim();
    setFilter("");
    setAddresses("loading");
    try {
      const res = await fetch(`/api/address-search?postcode=${encodeURIComponent(pc)}`);
      const data = await res.json();
      const listData: AddressMatch[] = Array.isArray(data) ? data : [];
      setAddresses(listData);
      // Pre-narrow to the typed street ONLY if it actually matches; otherwise show all + flag it, so a
      // property with no lodged EPC doesn't dead-end ("parrots the address, then does nothing").
      const hit = !!street && listData.some((a) => norm(a.line1).includes(norm(street)));
      setFilter(hit ? street : "");
      setNotFound(street && !hit && listData.length > 0 ? street : null);
    } catch {
      setAddresses([]);
      setError("Couldn’t load addresses for that postcode.");
    }
  }

  async function pickAddress(a: AddressMatch) {
    setReport("loading");
    setError(null);
    try {
      const qs = new URLSearchParams({
        postcode: a.postcode,
        uprn: a.uprn,
        line1: a.line1,
        address: a.address,
      });
      const res = await fetch(`/api/property?${qs.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn’t build the property report.");
      setReport(data as PropertyReport);
    } catch (e) {
      setReport(null);
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-12">
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{def.headline}</h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--muted)]">{def.sub}</p>
      </div>

      <div className="mt-6 flex justify-center">
        <RouteSelector value={route} onChange={onRoute} variant="tabs" />
      </div>

      <form onSubmit={lookupPostcode} className="mx-auto mt-6 flex max-w-md gap-2">
        <input
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          placeholder="Postcode (or a full address with its postcode), e.g. M14 5SZ"
          autoComplete="postal-code"
          aria-label="Postcode"
          className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-white px-4 py-2.5 text-sm shadow-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          className="shrink-0 rounded-xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
        >
          Find addresses
        </button>
      </form>

      {error && (
        <div className="mx-auto mt-4 max-w-md rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-6">
        {report ? (
          <ReportSection report={report} onBack={() => setReport(null)} />
        ) : (
          <AddressPicker
            addresses={addresses}
            onPick={pickAddress}
            filter={filter}
            onFilter={(v) => {
              setNotFound(null);
              setFilter(v);
            }}
            notFound={notFound}
          />
        )}
      </div>
    </div>
  );
}

function AddressPicker({
  addresses,
  onPick,
  filter,
  onFilter,
  notFound,
}: {
  addresses: AddrState;
  onPick: (a: AddressMatch) => void;
  filter: string;
  onFilter: (v: string) => void;
  notFound?: string | null;
}) {
  const list = Array.isArray(addresses) ? addresses : [];
  const shown = useMemo(() => {
    const q = norm(filter);
    return q ? list.filter((a) => norm(a.line1).includes(q)) : list;
  }, [list, filter]);

  if (addresses === "no-postcode")
    return (
      <Card title="Enter a postcode" subtitle="Free address lookup is by postcode">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          Type a UK <strong>postcode</strong> (e.g. <span className="font-mono">M14 5SZ</span>) and we’ll
          list the addresses at it to pick from. A full address works too, as long as it includes the
          postcode — we can’t search by street name alone on the free tier.
        </p>
      </Card>
    );
  if (addresses === null)
    return (
      <p className="text-center text-sm text-[var(--muted)]">
        Enter a postcode above to list the specific addresses at it.
      </p>
    );
  if (addresses === "loading")
    return <p className="text-center text-sm text-[var(--muted)]">Finding addresses…</p>;
  if (!list.length)
    return (
      <Card title="No addresses found" subtitle="From the EPC register">
        <p className="text-sm text-[var(--muted)]">
          The EPC register has no certificated addresses for that postcode, so there’s nothing to pick.
          Double-check the postcode, or it may be a property type without a lodged EPC.
        </p>
      </Card>
    );

  return (
    <Card title={`${list.length} addresses`} subtitle="Pick the exact property">
      {notFound && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
          We couldn’t find <strong>“{notFound}”</strong> here — the picker only lists properties with a
          lodged EPC, and many homes don’t have one. Showing all {list.length} EPC-listed addresses at
          this postcode; pick the closest, or it may not be checkable on free data.
        </div>
      )}
      {(list.length > 8 || filter) && (
        <input
          value={filter}
          onChange={(e) => onFilter(e.target.value)}
          placeholder="Filter by house number or name…"
          className="mb-2 w-full rounded-lg border border-[var(--border)] px-3 py-2 text-sm outline-none focus:border-[var(--primary)]"
        />
      )}
      {!shown.length && (
        <p className="mb-2 text-xs text-[var(--muted)]">
          Nothing matches “{filter}”. Clear the filter to see all {list.length}.
        </p>
      )}
      <ul className="max-h-[26rem] divide-y divide-[var(--border)] overflow-auto">
        {shown.map((a) => (
          <li key={a.uprn || a.line1}>
            <button
              onClick={() => onPick(a)}
              className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-slate-50"
            >
              <span className="min-w-0 truncate text-sm font-medium">{a.line1}</span>
              <span className="shrink-0 text-[11px] text-[var(--muted)]">
                {a.epcBand ? `EPC ${a.epcBand}` : a.ctaxBand ? `Tax ${a.ctaxBand}` : "no EPC"} →
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ReportSection({ report, onBack }: { report: PropertyReport | "loading"; onBack: () => void }) {
  if (report === "loading")
    return <p className="text-center text-sm text-[var(--muted)]">Building the property report…</p>;
  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="text-sm font-medium text-[var(--primary)] hover:underline"
      >
        ← Other addresses at {report.postcode}
      </button>
      <PropertyReportView report={report} />
    </div>
  );
}

function PropertyReportView({ report }: { report: PropertyReport }) {
  const f = report.facts;
  const ct = report.councilTax;
  const propType = report.sales.find((s) => s.type)?.type;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">{report.line1}</h2>
        <p className="text-sm text-[var(--muted)]">
          {report.address}
          {f.district ? ` · ${f.district}` : ""}
        </p>
      </div>

      <div>
        <div className="h-60 overflow-hidden rounded-2xl border border-[var(--border)] shadow-sm">
          <PropertyMap centre={report.centre} label={report.line1} />
        </div>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Approximate location (postcode centroid), not the exact plot.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Stat label="EPC / energy rating">
          {report.epc?.band ? (
            <EpcScale band={report.epc.band} date={report.epc.date} />
          ) : (
            <p className="text-sm text-[var(--muted)]">No EPC lodged for this property.</p>
          )}
        </Stat>

        <Stat label="Council tax band">
          {ct.band ? (
            <>
              <div className="flex items-center gap-2">
                <Band letter={ct.band} bg="#312e81" fg="#fff" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">
                    {ct.annualCost ? `≈ ${gbp(ct.annualCost)}/yr` : `Band ${ct.band}`}
                  </p>
                  <p className="text-[11px] leading-tight text-[var(--muted)]">
                    {ct.source === "voa" ? "exact band (VOA)" : "typical for this area"}
                    {ct.annualCost ? " · all-in, 2026-27" : ""}
                  </p>
                </div>
              </div>
              {ct.neighbourhood?.total ? (
                <CtaxBar bands={ct.neighbourhood.bands} total={ct.neighbourhood.total} />
              ) : null}
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Band unavailable.</p>
          )}
        </Stat>

        <Stat label="Tenure & type">
          <p className="text-sm font-semibold">
            {report.tenure ? titleCase(report.tenure) : "Tenure not recorded"}
            {propType && (
              <span className="font-normal text-[var(--muted)]"> · {titleCase(propType)}</span>
            )}
          </p>
          {!report.tenure && !propType && (
            <p className="mt-0.5 text-xs text-[var(--muted)]">No sale on record to derive these.</p>
          )}
        </Stat>

        <Stat label="Flood risk">
          <p className="text-sm font-semibold">
            {floodLabel(report.flood?.status)}
            {report.flood && report.flood.activeWarnings > 0 && (
              <span className="ml-1 font-normal text-amber-700">
                · {report.flood.activeWarnings} active now
              </span>
            )}
          </p>
        </Stat>
      </div>

      <TransportCard transport={report.transport} />

      <Card title="Sold price history" subtitle="HM Land Registry · this address">
        {report.sales.length ? (
          <>
            {report.sales.length > 1 && <PriceGrowth sales={report.sales} />}
            <ul className="divide-y divide-[var(--border)]">
              {report.sales.map((s, i) => (
                <SaleRow key={`${s.date}-${i}`} sale={s} />
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-[var(--muted)]">
            No sales recorded for this address since 1995 (the property may not have changed hands, or
            sold before records began).
          </p>
        )}
      </Card>

      <NeighbourhoodToggle postcode={report.postcode} />

      <p className="text-[11px] leading-relaxed text-[var(--muted)]">
        EPC band from the MHCLG register; council-tax band from the VOA (exact where matched, otherwise
        the neighbourhood’s typical band); sold prices and tenure from HM Land Registry; flood from the
        Environment Agency at the postcode location; nearest stations from OpenStreetMap.
      </p>
    </div>
  );
}

// Opt-in "see the neighbourhood" panel: fetches the area report for the property's postcode (once)
// and shows the area panels inline. Manages its own school-detail drawer. Collapsed by default.
function NeighbourhoodToggle({ postcode }: { postcode: string }) {
  const [open, setOpen] = useState(false);
  const [area, setArea] = useState<AreaReport | "loading" | null>(null);
  const [filters, setFilters] = useState<SchoolFilters>(DEFAULT_FILTERS);
  const [school, setSchool] = useState<School | null>(null);

  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    if (area) return; // fetched once, kept
    setArea("loading");
    try {
      const res = await fetch(`/api/area?postcode=${encodeURIComponent(postcode)}&radius=1`);
      const d = await res.json();
      setArea(res.ok ? (d as AreaReport) : null);
    } catch {
      setArea(null);
    }
  }

  return (
    <div>
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-left text-sm font-semibold shadow-sm transition hover:bg-slate-50"
      >
        <span>{open ? "Hide neighbourhood" : "See the neighbourhood"}</span>
        <span className="text-[11px] font-normal text-[var(--muted)]">
          schools · crime · deprivation · amenities · broadband · noise {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <div className="mt-4 space-y-4">
          {area === "loading" && (
            <p className="text-center text-sm text-[var(--muted)]">Loading the neighbourhood…</p>
          )}
          {area === null && (
            <p className="text-center text-sm text-[var(--muted)]">
              Couldn’t load the neighbourhood just now.
            </p>
          )}
          {area && area !== "loading" && (
            <>
              <RankingsPanel report={area} />
              <SchoolsPanel
                schools={area.schools}
                radiusMiles={area.radiusMiles}
                ofstedLoaded={area.ofstedLoaded}
                onSelect={setSchool}
                filters={filters}
                onChange={setFilters}
              />
              <CrimePanel crime={area.crime} benchmark={area.benchmarks.crime} />
              <AmenitiesPanel amenities={area.amenities} />
              <BroadbandPanel broadband={area.broadband} />
              {area.facts.country === "England" && <NoisePanel noise={area.noise} />}
              <DeprivationPanel facts={area.facts} />
              <PricePanel prices={area.prices} benchmark={area.benchmarks.price} />
            </>
          )}
        </div>
      )}

      {school && <SchoolDetail school={school} onClose={() => setSchool(null)} />}
    </div>
  );
}

// Nearest rail/metro/tram stations (OpenStreetMap). A connectivity signal — the named nearest
// station(s), not the walkable amenity count in "See the neighbourhood". Distances are straight-line.
function TransportCard({ transport }: { transport: TransportSummary | null }) {
  if (!transport) {
    return (
      <Card title="Transport" subtitle="Nearest stations · OpenStreetMap">
        <p className="text-sm text-[var(--muted)]">
          Transport data (OpenStreetMap) is temporarily unavailable.
        </p>
      </Card>
    );
  }
  if (!transport.stations.length) {
    return (
      <Card title="Transport" subtitle="Nearest stations · OpenStreetMap">
        <p className="text-sm text-[var(--muted)]">
          No train, tram or metro station within {transport.searchRadiusMiles} miles.
        </p>
      </Card>
    );
  }
  return (
    <Card title="Transport" subtitle="Nearest stations · OpenStreetMap">
      <ul className="divide-y divide-[var(--border)]">
        {transport.stations.map((s) => (
          <li key={`${s.kind}-${s.name}`} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm font-medium">{s.name}</span>
              <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                {STATION_KIND[s.kind]}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              {fmtMiles(s.distanceMiles)} mi
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Straight-line distance from the postcode to the nearest stations (OpenStreetMap) — not walking
        time.
      </p>
    </Card>
  );
}

const STATION_KIND: Record<TransportStation["kind"], string> = {
  rail: "Train",
  metro: "Underground / Metro",
  light_rail: "Light rail",
  tram: "Tram",
};
const fmtMiles = (m: number) => (m < 0.1 ? "<0.1" : m.toFixed(1));

function SaleRow({ sale }: { sale: PriceSale }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm">
      <span className="text-[var(--muted)]">{fmtDate(sale.date)}</span>
      <span className="flex-1 truncate text-right capitalize text-[var(--muted)]">{sale.type ?? ""}</span>
      <span className="shrink-0 font-semibold tabular-nums">{gbp(sale.price)}</span>
    </li>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function Band({ letter, bg, fg }: { letter: string; bg: string; fg: string }) {
  return (
    <span
      className="grid h-9 w-9 place-items-center rounded-lg text-lg font-bold"
      style={{ backgroundColor: bg, color: fg }}
    >
      {letter}
    </span>
  );
}

const EPC_BANDS = ["A", "B", "C", "D", "E", "F", "G"];
const EPC_FG: Record<string, string> = {
  A: "#ffffff",
  B: "#ffffff",
  C: "#1a3a08",
  D: "#3a3000",
  E: "#ffffff",
  F: "#ffffff",
  G: "#ffffff",
};

// The A–G energy scale with the property's band highlighted and the rest dimmed - like an EPC chart.
function EpcScale({ band, date }: { band: string; date?: string }) {
  return (
    <div>
      <div className="flex gap-0.5">
        {EPC_BANDS.map((b) => (
          <div
            key={b}
            className={`grid flex-1 place-items-center rounded py-1.5 text-[11px] font-bold ${
              b === band ? "ring-2 ring-slate-900/70" : "opacity-30"
            }`}
            style={{ backgroundColor: EPC_BG[b], color: EPC_FG[b] ?? "#ffffff" }}
          >
            {b}
          </div>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-[var(--muted)]">
        Current rating <span className="font-semibold text-[var(--foreground)]">{band}</span>
        {date ? ` · certified ${fmtMonth(date)}` : ""}
      </p>
    </div>
  );
}

// Oldest → newest price change for this address (shown above the sale list).
function PriceGrowth({ sales }: { sales: PriceSale[] }) {
  const newest = sales[0];
  const oldest = sales[sales.length - 1];
  if (!newest || !oldest || oldest.price <= 0) return null;
  const pct = Math.round(((newest.price - oldest.price) / oldest.price) * 100);
  const yrs = new Date(newest.date).getFullYear() - new Date(oldest.date).getFullYear();
  return (
    <p className="mb-2 text-sm">
      <span className={`font-semibold ${pct >= 0 ? "text-emerald-700" : "text-red-700"}`}>
        {pct >= 0 ? "+" : ""}
        {pct}%
      </span>
      <span className="text-[var(--muted)]">
        {yrs >= 1 ? ` over ${yrs} year${yrs === 1 ? "" : "s"}` : ""} · {gbp(oldest.price)} →{" "}
        {gbp(newest.price)}
      </span>
    </p>
  );
}

function titleCase(s: string): string {
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}

// The neighbourhood council-tax band mix (the LSOA distribution) as a compact stacked bar,
// light A → dark H/I, beneath the property's own band.
function CtaxBar({ bands, total }: { bands: Record<string, number>; total: number }) {
  const segs = Object.keys(bands)
    .sort()
    .map((b) => ({ band: b, pct: (bands[b] / total) * 100 }))
    .filter((s) => s.pct > 0);
  return (
    <div className="mt-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full" aria-hidden="true">
        {segs.map((s) => (
          <div
            key={s.band}
            title={`Band ${s.band}: ${Math.round(s.pct)}%`}
            style={{ width: `${s.pct}%`, backgroundColor: ctaxBg(s.band) }}
          />
        ))}
      </div>
      <p className="mt-1 text-[10px] text-[var(--muted)]">Neighbourhood band mix (VOA 2025)</p>
    </div>
  );
}
function ctaxBg(band: string): string {
  const pos = Math.max(0, Math.min(8, band.charCodeAt(0) - 65)); // A=0 … I=8
  return `hsl(222 39% ${80 - (pos / 8) * 46}%)`;
}

const EPC_BG: Record<string, string> = {
  A: "#0c8a4f",
  B: "#2f9e44",
  C: "#8dce46",
  D: "#e6b800",
  E: "#ef8023",
  F: "#e9633b",
  G: "#e9153b",
};

const gbp = (n: number) => "£" + Math.round(n).toLocaleString("en-GB");

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
function fmtMonth(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}
function floodLabel(status?: string): string {
  if (status === "warning-area") return "In a flood warning area";
  if (status === "alert-area") return "In a flood alert area";
  if (status === "clear") return "Not in a flood warning/alert area";
  return "Unavailable";
}
