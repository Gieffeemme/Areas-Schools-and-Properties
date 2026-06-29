#!/usr/bin/env node
/**
 * Build src/data/scotland-crime-by-laua.json from the Scottish Government "Recorded Crimes and Offences"
 * statistics. police.uk has no Police Scotland street-level data, so Scotland can't get the street-level
 * crime map the other nations get — this is the honest alternative: COUNCIL-AREA recorded crime (rate
 * per 10,000 population) for the latest year, by the five crime groups, + the Scotland average for
 * context. Keyed by council-area code (S12…), which postcodes.io returns in codes.admin_district.
 *
 * Source: statistics.gov.scot "recorded-crime" cube, full CSV download (OGL v3.0).
 *   https://statistics.gov.scot/data/recorded-crime
 *   npm run etl:scotland-crime                # downloads the cube CSV (~12 MB)
 *   npm run etl:scotland-crime -- file.csv    # parse a local cube CSV
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "scotland-crime-by-laua.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const URL =
  "https://statistics.gov.scot/downloads/cube-table?uri=http%3A%2F%2Fstatistics.gov.scot%2Fdata%2Frecorded-crime";

// The five "crime" groups (groups 6–8 are offences: antisocial / misc / road-traffic — not surfaced).
const GROUPS = [
  ["All Group 1: Non-sexual crimes of violence", "violence", "Violence (non-sexual)"],
  ["All Group 2: Sexual crimes", "sexual", "Sexual crimes"],
  ["All Group 3: Crimes of dishonesty", "dishonesty", "Dishonesty (theft etc.)"],
  ["All Group 4: Damage and reckless behaviour", "damage", "Damage & reckless"],
  ["All Group 5: Crimes against society", "society", "Against society (drugs/weapons)"],
];
const TOTAL = "All Crimes"; // = groups 1–5

function parseLine(l) {
  const out = [];
  let f = "";
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"') { if (l[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ",") { out.push(f); f = ""; }
    else f += c;
  }
  out.push(f);
  return out;
}

async function getCsv(arg) {
  if (arg) return readFile(arg, "utf8");
  console.log("Downloading statistics.gov.scot recorded-crime cube (~12 MB)…");
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`statistics.gov.scot returned ${res.status}`);
  return res.text();
}

async function main() {
  const lines = (await getCsv(process.argv[2])).split(/\r?\n/).filter((l) => l.length);
  const hdr = parseLine(lines[0]);
  const ci = (re) => hdr.findIndex((h) => re.test(h.trim()));
  const C = {
    code: ci(/^FeatureCode$/i), name: ci(/^FeatureName$/i), type: ci(/^FeatureType$/i),
    date: ci(/^DateCode$/i), meas: ci(/^Measurement$/i), val: ci(/^Value$/i), grp: ci(/^Crime or Offence$/i),
  };
  for (const [k, i] of Object.entries(C)) if (i < 0) throw new Error(`column not found: ${k}`);

  const rows = lines.slice(1).map(parseLine);
  const latest = rows.map((r) => r[C.date]).filter(Boolean).sort().pop();
  const groupKey = new Map(GROUPS.map(([label, key]) => [label, key]));

  // value lookup: code → group label → measure → value, for the latest year only
  const v = new Map();
  for (const r of rows) {
    if (r[C.date] !== latest) continue;
    const label = r[C.grp];
    if (label !== TOTAL && !groupKey.has(label)) continue;
    const n = Number(r[C.val]);
    if (!Number.isFinite(n)) continue;
    v.set(`${r[C.code]}|${label}|${r[C.meas]}`, n);
  }
  const get = (code, label, meas) => v.get(`${code}|${label}|${meas}`);

  const scotlandRate = get("S92000003", TOTAL, "Ratio");
  if (scotlandRate == null) throw new Error("Scotland-level All Crimes rate not found");

  const byLaua = {};
  for (const r of rows) {
    if (r[C.type] !== "Council Area" || r[C.date] !== latest) continue;
    const code = r[C.code];
    if (byLaua[code]) continue;
    const rate = get(code, TOTAL, "Ratio");
    const count = get(code, TOTAL, "Count");
    if (rate == null) continue;
    byLaua[code] = {
      name: r[C.name],
      rate,
      count,
      groups: GROUPS.map(([label, key, short]) => ({
        key, label: short, rate: get(code, label, "Ratio") ?? null, count: get(code, label, "Count") ?? null,
      })),
    };
  }

  const n = Object.keys(byLaua).length;
  if (n < 30) throw new Error(`only ${n} council areas — expected 32; refusing to write`);

  const year = latest.replace(/^(\d{4})\/\d{2}(\d{2})$/, "$1/$2"); // 2025/2026 → 2025/26
  await writeFile(OUT, JSON.stringify({ year, scotlandRate, byLaua }) + "\n");
  console.log(`Wrote ${n} council areas (recorded crime ${year}) → ${OUT}`);
  console.log(`  Scotland average: ${scotlandRate} per 10,000`);
  for (const c of ["S12000036", "S12000049"]) if (byLaua[c]) console.log(`  ${byLaua[c].name}: ${byLaua[c].rate}/10k (${byLaua[c].count} crimes)`);
}

main().catch((e) => {
  console.error("Scotland crime ETL failed:", e.message);
  process.exit(1);
});
