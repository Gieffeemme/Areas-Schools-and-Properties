import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

// Operational health check. Two things this app can't see on its own:
//   1. Silent staleness — committed datasets quietly age (see data-manifest.json for their vintages).
//   2. Silent breakage — a runtime upstream (postcodes.io, police.uk, flood services, …) goes dark
//      and the app just fail-softs to "unavailable"; nobody notices until a user does.
// This endpoint surfaces both so an uptime pinger or a daily Action can alert on them.
//
//   GET /api/health            → 200, JSON report (status: ok | degraded | down)
//   GET /api/health?strict=1   → 503 instead of 200 when status !== "ok" (for non-2xx alerting)
//   GET /api/health?data=only  → skip the upstream pings (cheap; freshness only)

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- 1. Data freshness --------------------------------------------------------------------------

type Dataset = { file: string; records: number | null; bytes: number; lastCommit: string };
type Manifest = { generatedAt: string; datasetCount: number; datasets: Dataset[] };

// Coarse "worth-a-look" budget by cadence — NOT a hard rule (release cadences vary a lot). It only
// prompts a check for a newer release; an over-budget dataset is still valid, just dated.
function staleBudgetDays(file: string): number {
  if (/^(gias|ofsted-by-urn|nurseries|report-cards)/.test(file)) return 90; // monthly-ish registers/grades
  if (/^(imd-domains|wimd|simd|nimdm|greenspace|amenities|stations|ev-charging)/.test(file)) return 1100; // multi-year / geo
  return 450; // annual: results, finance, workforce, census, area stats, school registers
}

function readManifest(): Manifest | null {
  try {
    return JSON.parse(readFileSync(join(process.cwd(), "src", "data", "data-manifest.json"), "utf8"));
  } catch {
    return null;
  }
}

function freshness(now: number) {
  const m = readManifest();
  if (!m) return { generatedAt: null, datasets: [] as unknown[], staleCount: 0, ok: false };
  const datasets = m.datasets.map((d) => {
    const ageDays = Math.round((now - Date.parse(d.lastCommit)) / 86400000);
    const budget = staleBudgetDays(d.file);
    return { file: d.file, records: d.records, ageDays, budgetDays: budget, stale: ageDays > budget };
  });
  return {
    generatedAt: m.generatedAt,
    datasets,
    staleCount: datasets.filter((d) => d.stale).length,
    ok: true,
  };
}

// ---- 2. Upstream liveness -----------------------------------------------------------------------

type Upstream = { name: string; url: string; backs: string; critical?: boolean; expectJson?: boolean };

// Each entry pings the SAME host/service the app calls at request time. Cheap endpoints chosen where
// possible; reachability (host answered) is the signal — this catches outages/DNS/TLS/timeouts, not
// subtle schema drift (that's the smoke test's job).
const UPSTREAMS: Upstream[] = [
  { name: "postcodes.io", url: "https://api.postcodes.io/postcodes/SW1A1AA", backs: "geocoding (every lookup)", critical: true, expectJson: true },
  { name: "police.uk", url: "https://data.police.uk/api/forces", backs: "crime (England/Wales/NI)" },
  { name: "Land Registry", url: "https://landregistry.data.gov.uk/app/ppd?postcode=SW1A2AA", backs: "sold prices" },
  { name: "planning.data.gov.uk", url: "https://www.planning.data.gov.uk/entity.json?limit=1", backs: "planning constraints" },
  { name: "PlanIt", url: "https://www.planit.org.uk/api/applics/json?lat=51.5&lng=-0.12&krad=0.5&pg_sz=1", backs: "planning applications" },
  { name: "EA flood risk", url: "https://check-long-term-flood-risk.service.gov.uk/", backs: "England flood risk" },
  { name: "EA environment API", url: "https://environment.data.gov.uk/flood-monitoring/id/floods?_limit=1", backs: "bathing water · noise (England)" },
  { name: "EPC register", url: "https://find-energy-certificate.service.gov.uk/", backs: "EPC (per-property)" },
  { name: "Nomis (census)", url: "https://www.nomisweb.co.uk/api/v01/dataset/NM_2021_1.def.sdmx.json", backs: "census demographics" },
  { name: "SEPA flood", url: "https://map.sepa.org.uk/server/rest/services/Open/Flood_Maps/MapServer?f=json", backs: "Scotland flood" },
  { name: "NRW flood (Wales)", url: "https://datamap.gov.wales/geoserver/inspire-nrw/ows?service=WMS&request=GetCapabilities", backs: "Wales flood" },
  { name: "VOA council tax", url: "https://www.tax.service.gov.uk/check-council-tax-band/search", backs: "council-tax band lookup" },
];

type Ping = { name: string; backs: string; critical: boolean; state: "up" | "reachable" | "down"; status: number; ms: number; detail?: string };

async function ping(u: Upstream, now: () => number): Promise<Ping> {
  const started = now();
  const base = { name: u.name, backs: u.backs, critical: !!u.critical };
  try {
    const res = await fetch(u.url, {
      method: "GET",
      redirect: "follow",
      headers: { "User-Agent": "area-intel-health/1.0", Accept: "application/json, text/html;q=0.9, */*;q=0.8" },
      signal: AbortSignal.timeout(9000),
      cache: "no-store",
    });
    const ms = now() - started;
    // Critical upstream must return usable JSON, not just a 200 splash/redirect page.
    if (u.expectJson) {
      if (!res.ok) return { ...base, state: res.status >= 500 ? "down" : "reachable", status: res.status, ms };
      try {
        const j: unknown = await res.json();
        const good = !!j && typeof j === "object";
        return { ...base, state: good ? "up" : "down", status: res.status, ms, detail: good ? undefined : "unexpected JSON shape" };
      } catch {
        return { ...base, state: "down", status: res.status, ms, detail: "invalid JSON" };
      }
    }
    // Others: don't buffer the body — status is enough.
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    let state: Ping["state"];
    if (res.ok || (res.status >= 300 && res.status < 400)) state = "up";
    else if (res.status >= 400 && res.status < 500) state = "reachable"; // service answered (auth/params) → app's real request is fine
    else state = "down";
    return { ...base, state, status: res.status, ms };
  } catch (e) {
    const ms = now() - started;
    const name = (e as { name?: string })?.name;
    const detail = name === "TimeoutError" ? "timeout" : (e as Error)?.message || "network error";
    return { ...base, state: "down", status: 0, ms, detail };
  }
}

// ---- handler ------------------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const now = () => Date.now();
  const dataOnly = req.nextUrl.searchParams.get("data") === "only";
  const strict = req.nextUrl.searchParams.get("strict") === "1";

  const data = freshness(now());
  const upstreams = dataOnly ? [] : await Promise.all(UPSTREAMS.map((u) => ping(u, now)));

  const criticalDown = upstreams.some((u) => u.critical && u.state === "down");
  const anyDown = upstreams.some((u) => u.state === "down");
  const status: "ok" | "degraded" | "down" =
    criticalDown || !data.ok ? "down" : anyDown || data.staleCount > 0 ? "degraded" : "ok";

  const body = {
    status,
    checkedAt: new Date().toISOString(),
    upstreams: {
      up: upstreams.filter((u) => u.state === "up").length,
      reachable: upstreams.filter((u) => u.state === "reachable").length,
      down: upstreams.filter((u) => u.state === "down").length,
      checks: upstreams,
    },
    data: {
      manifestGeneratedAt: data.generatedAt,
      staleCount: data.staleCount,
      datasets: data.datasets,
    },
  };

  return NextResponse.json(body, {
    status: strict && status !== "ok" ? 503 : 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
