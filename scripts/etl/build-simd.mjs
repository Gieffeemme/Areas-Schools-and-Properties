#!/usr/bin/env node
/**
 * Build src/data/simd-by-datazone.json from the Scottish Government's Scottish Index of Multiple
 * Deprivation (SIMD) 2020v2 — the Scottish analog of England's IMD / Wales' WIMD. Keyed by 2011 data
 * zone code (S01…), which postcodes.io returns in codes.lsoa11 for Scottish postcodes. Per data zone:
 * the overall rank (1 = most deprived of 6,976 Scottish data zones), the overall decile (1 = most
 * deprived 10%, 10 = least), and the decile for each of the seven SIMD domains.
 *
 * Geography note: SIMD 2020 is on **2011** data zones, so it joins postcodes.io's codes.lsoa11 (NOT
 * codes.lsoa, which now returns the 2022 data zone). postcodes.io's own deprivation field IS the SIMD
 * rank for Scotland (matches this dataset), but we use this file for the authoritative rank + domains.
 *
 * The ranks file publishes domain *ranks* only, so domain ranks → deciles via SIMD's published decile
 * boundaries (verified to reproduce the official rank→decile lookup exactly). Tied ranks carry a .5
 * (SIMD convention); the `<=` bound test handles them.
 *
 * Source: "SIMD 2020v2 - ranks" (XLSX), Scottish Government, OGL v3.0.
 *   https://www.gov.scot/collections/scottish-index-of-multiple-deprivation-2020/
 *   npm run etl:simd                 # downloads the XLSX
 *   npm run etl:simd -- file.xlsx    # parse a local file
 */
import * as XLSX from "xlsx";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "simd-by-datazone.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const YEAR = "2020v2";
const URL =
  "https://www.gov.scot/binaries/content/documents/govscot/publications/statistics/2020/01/scottish-index-of-multiple-deprivation-2020-ranks-and-domain-ranks/documents/scottish-index-of-multiple-deprivation-2020-ranks-and-domain-ranks/scottish-index-of-multiple-deprivation-2020-ranks-and-domain-ranks/govscot%3Adocument/SIMD%2B2020v2%2B-%2Branks.xlsx";
const SHEET = "SIMD 2020v2 ranks";

// SIMD 2020 decile band upper-bounds for 6,976 ranked data zones (from gov.scot's official "SIMD rank
// to quintile, decile and vigintile" lookup — reproduces the official decile for all 6,976 ranks).
const DECILE_BOUNDS = [697, 1395, 2092, 2790, 3488, 4185, 4883, 5580, 6278, 6976];
const decileOf = (rank) => {
  for (let i = 0; i < DECILE_BOUNDS.length; i++) if (rank <= DECILE_BOUNDS[i]) return i + 1;
  return 10;
};

// header regex → output key, in panel order
const DOMAINS = [
  [/Income_Domain_Rank/i, "income"],
  [/Employment_Domain_Rank/i, "employment"],
  [/Education_Domain_Rank/i, "education"],
  [/Health_Domain_Rank/i, "health"],
  [/Crime_Domain_Rank/i, "crime"],
  [/Housing_Domain_Rank/i, "housing"],
  [/Access_Domain_Rank/i, "access"],
];

async function loadWorkbook(arg) {
  if (arg) return XLSX.read(readFileSync(arg), { type: "buffer" });
  console.log("Downloading SIMD 2020v2 ranks (gov.scot)…");
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`gov.scot returned ${res.status}`);
  return XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
}

const rank = (v) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n >= 1 ? n : null; // SIMD tie-ranks carry .5, so not Number.isInteger
};

async function main() {
  const wb = await loadWorkbook(process.argv[2]);
  const sheet = wb.Sheets[SHEET];
  if (!sheet) throw new Error(`sheet "${SHEET}" not found (${wb.SheetNames.join(", ")})`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });

  const hdr = rows[0].map((h) => String(h).trim());
  const iCode = hdr.findIndex((h) => /^Data_Zone$/i.test(h));
  const iRank = hdr.findIndex((h) => /SIMD\d+v?\d*_Rank$/i.test(h));
  if (iCode < 0 || iRank < 0) throw new Error("Data_Zone / overall rank column not found");
  const domainCols = DOMAINS.map(([re, key]) => {
    const i = hdr.findIndex((h) => re.test(h));
    if (i < 0) throw new Error(`domain column not found: ${key}`);
    return [i, key];
  });

  const byZone = {};
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const code = String(row[iCode] ?? "").trim();
    if (!/^S01\d{6}$/.test(code)) continue; // Scottish data zones only
    const overall = rank(row[iRank]);
    if (overall == null) continue;
    const rec = { rank: overall, decile: decileOf(overall) };
    for (const [i, key] of domainCols) {
      const dr = rank(row[i]);
      rec[key] = dr == null ? null : decileOf(dr);
    }
    byZone[code] = rec;
  }

  const codes = Object.keys(byZone);
  if (codes.length < 6900) throw new Error(`only ${codes.length} data zones — looks truncated, refusing to write`);
  const maxRank = Math.max(...codes.map((c) => byZone[c].rank));
  if (maxRank !== codes.length) throw new Error(`rank range 1..${maxRank} ≠ ${codes.length} zones — unexpected`);

  await writeFile(OUT, JSON.stringify({ year: YEAR, count: codes.length, byZone }) + "\n");
  console.log(`Wrote ${codes.length} data-zone SIMD ${YEAR} records → ${OUT}`);
  for (const c of ["S01006506", "S01008678"]) {
    const x = byZone[c];
    if (x) console.log(`  sample ${c}: rank ${x.rank}/${codes.length} (decile ${x.decile})`);
  }
}

main().catch((e) => {
  console.error("SIMD ETL failed:", e.message);
  process.exit(1);
});
