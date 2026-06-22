#!/usr/bin/env node
/**
 * Build src/data/report-cards-by-urn.json — the new Ofsted "report card" outcomes for early-years
 * settings, scraped from the live provider pages because Ofsted's bulk MI download does NOT yet
 * carry them (see scripts/etl/README.md and build-nurseries.mjs).
 *
 * Why this exists: from November 2025 every EY inspection produces a "report card" on a 5-band scale
 * (Exceptional / Strong standard / Expected standard / Needs attention / Urgent improvement) with no
 * single 1–4 "overall effectiveness". The childcare-providers MI CSV (build-nurseries.mjs's source)
 * still publishes the OLD 1–4 schema and lags a quarter+, so a provider re-inspected under the new
 * framework keeps showing its superseded old grade. The only current source is the per-provider page
 * at reports.ofsted.gov.uk/provider/16/{urn} (16 = the EY provider-type code).
 *
 * SCAFFOLD STATUS: this is the foundation, not the full production run.
 *   - It parses one provider reliably (proven on URN 2821756, Phoenix Day Nursery → Expected standard).
 *   - Default run scrapes a small built-in sample. Pass URNs to scrape specific ones, or `--all` to
 *     sweep every EY URN in nurseries.json (the eventual full run — polite-but-slow, ~tens of minutes).
 *   - The output is NOT yet imported by the app. DO the runtime-load build cleanup before wiring a
 *     full-size report-cards JSON into src/lib/schools.ts, or `next build` will OOM (see DOCUMENTATION.md).
 *
 * Usage:
 *   npm run etl:report-cards                 # small built-in sample (proof)
 *   node scripts/etl/build-report-cards.mjs 2821756 123456    # specific URNs
 *   node scripts/etl/build-report-cards.mjs --all --limit 500 # sweep from nurseries.json
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "report-cards-by-urn.json");
const NURSERIES = join(HERE, "..", "..", "src", "data", "nurseries.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const PROVIDER = (urn) => `https://reports.ofsted.gov.uk/provider/16/${urn}`;

// The 5-band early-years report-card scale, with Ofsted's exact brand colours (read off the live
// scale graphic). `code` is our stable key; order is best→worst.
const BANDS = [
  { name: "Exceptional", code: "exceptional", colour: "#0176E0" },
  { name: "Strong standard", code: "strong", colour: "#33903C" },
  { name: "Expected standard", code: "expected", colour: "#5CD168" },
  { name: "Needs attention", code: "needs-attention", colour: "#FF8341" },
  { name: "Urgent improvement", code: "urgent", colour: "#CE1E02" },
];
const BAND_BY_NAME = new Map(BANDS.map((b) => [b.name.toLowerCase(), b]));

const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

// The page embeds the report-card markup HTML-entity-escaped; undo that before parsing.
const unescapeHtml = (s) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/&#8209;/g, "-")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");

const stripTags = (s) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function isoFromLongDate(s) {
  const m = String(s).match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return undefined;
  const mo = MONTHS[m[2].toLowerCase()];
  return mo ? `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}` : undefined;
}

/** Extract the trimmed text of every <hN> at the given level. */
function headings(html, level) {
  const out = [];
  const re = new RegExp(`<h${level}[^>]*>([\\s\\S]*?)</h${level}>`, "gi");
  for (const m of html.matchAll(re)) {
    const t = stripTags(m[1]);
    if (t) out.push(t);
  }
  return out;
}

/**
 * Count the per-area grade dots on each band row of the scale graphic. Each evaluation area renders
 * one coloured dot (`w-5 h-5 rounded-full`) on the row of its band; rows with no area have no dots.
 * We bound the scan to the scale graphic (which ends at "Our grades explained") so we don't pick up
 * unrelated circles elsewhere on the page.
 */
function areaDistribution(html) {
  const anchors = BANDS.map((b) => ({ b, i: html.indexOf(`class="w-48">${b.name}</div>`) }))
    .filter((a) => a.i >= 0)
    .sort((a, b) => a.i - b.i);
  if (!anchors.length) return null;
  const ge = html.indexOf("Our grades explained", anchors[0].i);
  const regionEnd = ge >= 0 ? ge : anchors[0].i + 4000;
  const dist = {};
  for (let k = 0; k < anchors.length; k++) {
    const start = anchors[k].i;
    const end = Math.min(k + 1 < anchors.length ? anchors[k + 1].i : regionEnd, regionEnd);
    const dots = (html.slice(start, end).match(/w-5 h-5 rounded-full/g) || []).length;
    if (dots > 0) dist[anchors[k].b.code] = dots;
  }
  return dist;
}

/**
 * Parse a report-card provider page into a structured record, or null if it isn't a new-framework
 * report card (e.g. the provider's latest inspection still predates Nov 2025 — those stay in the MI).
 */
export function parseReportCard(rawHtml, urn) {
  const html = unescapeHtml(rawHtml);
  const h3 = headings(html, 3);

  // Overall grade = the h3 whose text is exactly a band name (the legend uses h4; requirement rows
  // are "… requirements"/"… standards met", never a bare band name). No such h3 ⇒ old framework.
  const overallName = h3.find((t) => BAND_BY_NAME.has(t.toLowerCase()));
  if (!overallName) return null;
  const overall = BAND_BY_NAME.get(overallName.toLowerCase());

  const h2 = headings(html, 2);
  const inspText = h2.find((t) => /^Inspection report:/i.test(t)) || "";
  const inspectionDate = isoFromLongDate(inspText);

  const safeH3 = h3.find((t) => /^Safeguarding standards/i.test(t)) || "";
  const safeguarding = /not met/i.test(safeH3) ? "not met" : /met/i.test(safeH3) ? "met" : undefined;

  const name = stripTags((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [, ""])[1]) || undefined;

  return {
    urn: String(urn),
    name,
    framework: "report-card", // distinguishes new-scale records from the old 1–4 nurseries.json
    inspectionDate,
    overall: overall.code, // one of BANDS[].code
    overallLabel: overall.name,
    safeguarding, // "met" | "not met" | undefined
    areas: areaDistribution(html) || {}, // { [bandCode]: dotCount }
    source: PROVIDER(urn),
  };
}

async function fetchProvider(urn) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(PROVIDER(urn), { headers: { "User-Agent": UA } });
      if (res.status === 404) return { urn, status: 404 };
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { urn, html: await res.text() };
    } catch (e) {
      if (attempt === 2) return { urn, error: e.message };
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

// Ofsted report search, childcare category (level_1_types=2), open providers, sorted by latest-report
// date descending. Provider links are /provider/{typeCode}/{urn}; type 16 = non-domestic EY (our
// nurseries). Because it's date-sorted, every new-framework report card sits in a contiguous block at
// the front (reports on/after the Nov 2025 switch), so we can stop once we cross the boundary.
const SEARCH = (start) =>
  `https://reports.ofsted.gov.uk/search?level_1_types=2&status%5B0%5D=1&rows=100&start=${start}&sort=date&order=desc`;

/**
 * Discover + scrape new-framework EY report cards efficiently. Walks the date-desc childcare search,
 * scraping type-16 URNs that exist in nurseries.json (the ones we actually display), and stops after
 * a run of consecutive old-framework pages — i.e. once the date order has carried us past the new
 * framework's start. This touches only the new-framework nurseries plus a small buffer, not all ~23k.
 */
async function discoverAndScrape() {
  const nurseries = JSON.parse(await readFile(NURSERIES, "utf8"));
  const nurserySet = new Set(nurseries.map((n) => String(n.urn)));
  const cards = {};
  const seen = new Set();
  const tally = { "report-card": 0, "old-framework": 0, missing: 0, error: 0 };
  const STOP_AFTER_OLD = 80; // consecutive old-framework scrapes past the boundary → stop
  const MAX_PAGES = 300; // safety backstop (~30k results)
  let consecutiveOld = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    let html;
    try {
      html = unescapeHtml(await (await fetch(SEARCH(page * 100), { headers: { "User-Agent": UA } })).text());
    } catch (e) {
      console.warn(`  ! search page ${page} failed: ${e.message}`);
      continue;
    }
    const urns = [...html.matchAll(/\/provider\/16\/(\d+)/g)].map((m) => m[1]);
    if (urns.length === 0) break; // end of results
    const fresh = [];
    for (const u of urns) {
      if (seen.has(u)) continue;
      seen.add(u);
      if (nurserySet.has(u)) fresh.push(u);
    }
    const results = await mapPool(fresh, 5, async (urn) => {
      const r = await fetchProvider(urn);
      if (r.error) return { urn, kind: "error", message: r.error };
      if (r.status === 404) return { urn, kind: "missing" };
      const rec = parseReportCard(r.html, urn);
      return rec ? { urn, kind: "report-card", rec } : { urn, kind: "old-framework" };
    });
    let stop = false;
    for (const r of results) {
      tally[r.kind] = (tally[r.kind] || 0) + 1;
      if (r.kind === "report-card") {
        cards[r.rec.urn] = r.rec;
        consecutiveOld = 0;
      } else if (r.kind === "old-framework") {
        consecutiveOld++;
        if (page >= 2 && consecutiveOld >= STOP_AFTER_OLD) { stop = true; break; }
      }
    }
    const added = results.filter((r) => r.kind === "report-card").length;
    console.log(`  page ${page} (start ${page * 100}): +${added} cards · total ${Object.keys(cards).length} · consecutiveOld ${consecutiveOld}`);
    if (page % 10 === 9) await writeFile(OUT, JSON.stringify(cards, null, 2) + "\n"); // checkpoint
    if (stop) {
      console.log(`  crossed the framework boundary (${STOP_AFTER_OLD} consecutive old-framework) — stopping.`);
      break;
    }
  }
  return { cards, tally };
}

/** Map over URNs with a small concurrency cap, to stay polite to reports.ofsted.gov.uk. */
async function mapPool(items, concurrency, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

async function resolveUrns(args) {
  const explicit = args.filter((a) => /^\d+$/.test(a) || /^EY/i.test(a));
  if (explicit.length) return explicit;
  if (args.includes("--all")) {
    const nurseries = JSON.parse(await readFile(NURSERIES, "utf8"));
    const urns = nurseries.map((n) => n.urn);
    const li = args.indexOf("--limit");
    const limit = li >= 0 ? parseInt(args[li + 1], 10) : 0;
    return limit > 0 ? urns.slice(0, limit) : urns;
  }
  // Default scaffold sample: the confirmed new-framework case used to prove the parser.
  return ["2821756"];
}

async function main() {
  const args = process.argv.slice(2);

  // Efficient full-coverage mode: discover new-framework nurseries via the date-desc search.
  if (args.includes("--discover")) {
    console.log("Discovering new-framework EY report cards via Ofsted search (childcare, date-desc)…");
    const { cards, tally } = await discoverAndScrape();
    await writeFile(OUT, JSON.stringify(cards, null, 2) + "\n");
    const bands = {};
    for (const c of Object.values(cards)) bands[c.overallLabel] = (bands[c.overallLabel] || 0) + 1;
    const dates = Object.values(cards).map((c) => c.inspectionDate).filter(Boolean).sort();
    console.log(`\nWrote ${Object.keys(cards).length} report cards → ${OUT}`);
    console.log(`  scraped — report-card: ${tally["report-card"]} · old: ${tally["old-framework"]} · missing: ${tally.missing} · errors: ${tally.error}`);
    console.log(`  by band: ${JSON.stringify(bands)}`);
    console.log(`  inspection dates: ${dates[0] ?? "?"} … ${dates[dates.length - 1] ?? "?"}`);
    return;
  }

  const urns = await resolveUrns(args);
  console.log(`Scraping ${urns.length} EY provider page(s) for new-framework report cards…`);

  const results = await mapPool(urns, 5, async (urn) => {
    const r = await fetchProvider(urn);
    if (r.error) return { urn, kind: "error", message: r.error };
    if (r.status === 404) return { urn, kind: "missing" };
    const rec = parseReportCard(r.html, urn);
    return rec ? { urn, kind: "report-card", rec } : { urn, kind: "old-framework" };
  });

  const cards = {};
  const tally = { "report-card": 0, "old-framework": 0, missing: 0, error: 0 };
  for (const r of results) {
    tally[r.kind] = (tally[r.kind] || 0) + 1;
    if (r.kind === "report-card") cards[r.rec.urn] = r.rec;
    if (r.kind === "error") console.warn(`  ! ${r.urn}: ${r.message}`);
  }

  await writeFile(OUT, JSON.stringify(cards, null, 2) + "\n");
  console.log(
    `Wrote ${Object.keys(cards).length} report cards → ${OUT}\n` +
      `  report-card: ${tally["report-card"]}  ·  old-framework (left to MI): ${tally["old-framework"]}` +
      `  ·  missing: ${tally.missing}  ·  errors: ${tally.error}`,
  );
  for (const c of Object.values(cards)) {
    console.log(`  ${c.urn}  ${c.overallLabel.padEnd(18)} ${c.inspectionDate ?? "?"}  safeguarding:${c.safeguarding ?? "?"}  areas:${JSON.stringify(c.areas)}  ${c.name ?? ""}`);
  }
}

// Only run when invoked directly (`node build-report-cards.mjs`), not when imported for its parser.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("report-cards ETL failed:", e.message);
    process.exit(1);
  });
}
