#!/usr/bin/env node
/**
 * Build src/data/nimdm-by-soa.json from the Northern Ireland Multiple Deprivation Measure 2017
 * (NIMDM2017) — the NI analog of England's IMD / Wales' WIMD / Scotland's SIMD. Keyed by SOA code
 * (95…), which postcodes.io returns in codes.lsoa11 for NI postcodes. Per SOA: the overall MDM rank
 * (1 = most deprived of 890 NI Super Output Areas), the overall decile (1 = most deprived 10%, 10 =
 * least), and the decile for each of the seven NIMDM domains.
 *
 * Geography note: NI SOAs (890, the 2001/2011 vintage, codes like 95GG20S1) are what postcodes.io
 * returns in codes.lsoa11. codes.lsoa is the NEW 2021 NI data zone (N21…), which NIMDM 2017 isn't on —
 * so join codes.lsoa11. postcodes.io's own deprivation field IS the NIMDM rank for NI (matches this
 * dataset), but we use this file for the authoritative rank + domains.
 *
 * 890 SOAs / 10 = 89 exactly, so deciles are uniform: decile = ceil(rank / 89). The file gives ranks
 * only; domain ranks → deciles the same way.
 *
 * Source: "NIMDM 2017 - SOA" CSV, NISRA via Open Data NI, OGL v3.0.
 *   https://www.opendatani.gov.uk/@nisra/northern-ireland-multiple-deprivation-measures-2017
 *   npm run etl:nimdm                # downloads the CSV
 *   npm run etl:nimdm -- file.csv    # parse a local file
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "nimdm-by-soa.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const YEAR = "2017";
const SOA_COUNT = 890; // NI Super Output Areas — 890/10 = 89 per decile (uniform)
const URL =
  "https://admin.opendatani.gov.uk/dataset/e202fde9-7f0b-4d88-8711-e18a8817cff8/resource/60f31f62-53e7-424c-8fb5-d3b1c66ea277/download/nimdm2017-soa.csv";

// CSV header name → output key, in panel order. (The file's overall column is MDM_rank.)
const DOMAINS = [
  ["D1_Income_rank", "income"],
  ["D2_Empl_rank", "employment"],
  ["P4_Education_rank", "education"],
  ["D3_Health_rank", "health"],
  ["D7_CD_rank", "crime"], // Crime and Disorder
  ["D6_LivEnv_rank", "living"], // Living Environment
  ["P5_Access_rank", "access"], // Proximity to Services
];

const decileOf = (rank) => Math.min(10, Math.ceil(rank / (SOA_COUNT / 10)));

// Minimal CSV line splitter with quote handling (the fields we read are codes/ints, but be safe).
function parseLine(l) {
  const out = [];
  let f = "";
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) {
      if (c === '"') { if (l[i + 1] === '"') { f += '"'; i++; } else q = false; }
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(f); f = ""; }
    else f += c;
  }
  out.push(f);
  return out;
}

async function getCsv(arg) {
  if (arg) return readFile(arg, "utf8");
  console.log("Downloading NIMDM 2017 SOA data (Open Data NI)…");
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`Open Data NI returned ${res.status}`);
  return res.text();
}

async function main() {
  const lines = (await getCsv(process.argv[2])).split(/\r?\n/).filter((l) => l.length);
  const hdr = parseLine(lines[0]).map((h) => h.trim());
  const find = (name) => {
    const i = hdr.indexOf(name);
    if (i < 0) throw new Error(`column not found: ${name}`);
    return i;
  };
  const iCode = find("SOA2001");
  const iRank = find("MDM_rank");
  const domainCols = DOMAINS.map(([name, key]) => [find(name), key]);

  const rank = (v) => {
    const n = Number(String(v ?? "").trim());
    return Number.isInteger(n) && n >= 1 && n <= SOA_COUNT ? n : null;
  };

  const bySoa = {};
  for (let r = 1; r < lines.length; r++) {
    const x = parseLine(lines[r]);
    const code = (x[iCode] ?? "").trim();
    if (!/^95[A-Z0-9]{4,8}$/.test(code)) continue; // NI SOA codes
    const overall = rank(x[iRank]);
    if (overall == null) continue;
    const rec = { rank: overall, decile: decileOf(overall) };
    for (const [i, key] of domainCols) {
      const dr = rank(x[i]);
      rec[key] = dr == null ? null : decileOf(dr);
    }
    bySoa[code] = rec;
  }

  const codes = Object.keys(bySoa);
  if (codes.length !== SOA_COUNT)
    throw new Error(`got ${codes.length} SOAs, expected ${SOA_COUNT} — decile bands assume exactly ${SOA_COUNT}; refusing to write`);
  const maxRank = Math.max(...codes.map((c) => bySoa[c].rank));
  if (maxRank !== SOA_COUNT) throw new Error(`rank range 1..${maxRank} ≠ ${SOA_COUNT} SOAs — unexpected`);

  await writeFile(OUT, JSON.stringify({ year: YEAR, count: codes.length, bySoa }) + "\n");
  console.log(`Wrote ${codes.length} SOA NIMDM ${YEAR} records → ${OUT}`);
  for (const c of ["95GG20S1", "95MM22S2"]) {
    const x = bySoa[c];
    if (x) console.log(`  sample ${c}: rank ${x.rank}/${codes.length} (decile ${x.decile})`);
  }
}

main().catch((e) => {
  console.error("NIMDM ETL failed:", e.message);
  process.exit(1);
});
