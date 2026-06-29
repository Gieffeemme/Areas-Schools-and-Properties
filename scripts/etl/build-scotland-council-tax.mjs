#!/usr/bin/env node
/**
 * Build src/data/scotland-council-tax-by-laua.json from the Scottish Government "Council Tax datasets".
 * The England/Wales council-tax feature (VOA CTSOP band mix by LSOA + MHCLG £-per-band by LA) has no
 * Scotland equivalent, so this is the analog from two small gov.scot files, keyed by council-area code
 * (S12…, postcodes.io codes.admin_district):
 *   - "Council Tax by band" (latest year): the actual £/yr for each band A–H, per council.
 *   - "Chargeable dwellings": the count of dwellings in each band A–H per council (the band mix).
 * Both are council-level (Scotland publishes the neighbourhood/data-zone band mix only via the fiddlier
 * statistics.gov.scot cube; council-level is clean and the £-per-band is the valuable part).
 *
 * Source: gov.scot "Council tax datasets" (XLSX), OGL v3.0.
 *   https://www.gov.scot/publications/council-tax-datasets/
 *   npm run etl:scotland-council-tax                       # downloads both files
 *   npm run etl:scotland-council-tax -- cost.xlsx dwell.xlsx
 */
import * as XLSX from "xlsx";
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "scotland-council-tax-by-laua.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const B = "https://www.gov.scot/binaries/content/documents/govscot/publications/statistics/2019/04/council-tax-datasets/documents";
const COST_URL = `${B}/average-council-tax-per-dwelling/council-tax-by-band-2026-27/council-tax-by-band-2026-27/govscot%3Adocument/CTAS%2B2026%2B-%2BCouncil%2BTax%2BAssumptions%2B-%2BCouncil%2BTax%2Bby%2BBand%2B-%2B2026-27.xlsx`;
const DWELL_URL = `${B}/number-of-chargeable-dwellings/chargeable-dwellings---september-2025-data/chargeable-dwellings---september-2025-data/govscot%3Adocument/CTAXBASE%2B2025%2B-%2BTables%2B-%2BChargeable%2BDwellings.xlsx`;
const BANDS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// Scottish council name → ONS council-area (S12) code. Stable reference; postcodes.io returns the S12
// in codes.admin_district. Matched to the file names by normalised name (& → and, strip non-letters).
const NAME_TO_S12 = {
  "Aberdeen City": "S12000033", Aberdeenshire: "S12000034", Angus: "S12000041",
  "Argyll and Bute": "S12000035", "City of Edinburgh": "S12000036", Clackmannanshire: "S12000005",
  "Dumfries and Galloway": "S12000006", "Dundee City": "S12000042", "East Ayrshire": "S12000008",
  "East Dunbartonshire": "S12000045", "East Lothian": "S12000010", "East Renfrewshire": "S12000011",
  Falkirk: "S12000014", Fife: "S12000047", "Glasgow City": "S12000049", Highland: "S12000017",
  Inverclyde: "S12000018", Midlothian: "S12000019", Moray: "S12000020", "Na h-Eileanan Siar": "S12000013",
  "North Ayrshire": "S12000021", "North Lanarkshire": "S12000050", "Orkney Islands": "S12000023",
  "Perth and Kinross": "S12000048", Renfrewshire: "S12000038", "Scottish Borders": "S12000026",
  "Shetland Islands": "S12000027", "South Ayrshire": "S12000028", "South Lanarkshire": "S12000029",
  Stirling: "S12000030", "West Dunbartonshire": "S12000039", "West Lothian": "S12000040",
};
const norm = (s) => String(s ?? "").toLowerCase().replace(/&/g, "and").replace(/[^a-z]/g, "");
const S12_BY_NORM = new Map(Object.entries(NAME_TO_S12).map(([n, c]) => [norm(n), c]));

async function load(url, localArg) {
  if (localArg) return XLSX.read(await readFile(localArg), { type: "buffer" });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`gov.scot returned ${res.status}`);
  return XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
}

// Read a sheet where one header row has "Band A".."Band H"; return code → [8 band values], using the
// LA name in column 0. `pick` maps a raw cell to a number (rounded £, or a dwelling count).
function bandTable(wb, pick) {
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  const hi = rows.findIndex((r) => Array.isArray(r) && r.some((c) => /^band a$/i.test(String(c).trim())));
  if (hi < 0) throw new Error("'Band A' header not found");
  const bandCol = {};
  rows[hi].forEach((c, i) => { const m = /^band ([a-h])$/i.exec(String(c).trim()); if (m) bandCol[m[1].toUpperCase()] = i; });
  const out = {};
  for (let r = hi + 1; r < rows.length; r++) {
    const code = S12_BY_NORM.get(norm(rows[r][0]));
    if (!code || out[code]) continue;
    const vals = {};
    let ok = true;
    for (const b of BANDS) { const v = pick(rows[r][bandCol[b]]); if (v == null) ok = false; vals[b] = v; }
    if (ok) out[code] = { name: String(rows[r][0]).trim(), vals };
  }
  return out;
}

async function main() {
  const [costArg, dwellArg] = process.argv.slice(2);
  console.log("Reading gov.scot council-tax cost + chargeable-dwellings files…");
  const cost = bandTable(await load(COST_URL, costArg), (v) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n > 0 ? n : null;
  });
  const dwell = bandTable(await load(DWELL_URL, dwellArg), (v) => {
    const n = Math.round(Number(String(v).replace(/,/g, "")));
    return Number.isFinite(n) && n >= 0 ? n : null;
  });

  const byLaua = {};
  for (const [code, c] of Object.entries(cost)) {
    const d = dwell[code];
    if (!d) continue;
    const total = BANDS.reduce((s, b) => s + d.vals[b], 0);
    byLaua[code] = { name: c.name, total, bands: d.vals, cost: c.vals };
  }
  const n = Object.keys(byLaua).length;
  if (n < 30) throw new Error(`only ${n} councils joined (cost ∩ dwellings) — expected 32; refusing to write`);

  await writeFile(OUT, JSON.stringify({ costYear: "2026-27", bandYear: "2025", byLaua }) + "\n");
  console.log(`Wrote ${n} councils → ${OUT}`);
  for (const c of ["S12000036", "S12000049"]) {
    const x = byLaua[c];
    if (x) console.log(`  ${x.name}: ${x.total.toLocaleString()} dwellings; Band D £${x.cost.D.toLocaleString()}`);
  }
}

main().catch((e) => {
  console.error("Scotland council-tax ETL failed:", e.message);
  process.exit(1);
});
