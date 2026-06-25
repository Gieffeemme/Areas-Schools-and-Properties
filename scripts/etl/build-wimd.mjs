#!/usr/bin/env node
/**
 * Build src/data/wimd-by-lsoa.json from the Welsh Government's Welsh Index of Multiple Deprivation
 * (WIMD) 2025 — the Welsh analog of England's IMD. Keyed by LSOA 2021 code (W01…), which is what
 * postcodes.io returns in codes.lsoa for Welsh postcodes. Per LSOA: the overall rank (1 = most
 * deprived of 1,917 Welsh LSOAs), the overall decile (1 = most deprived 10%, 10 = least), and the
 * decile for each of the eight WIMD domains.
 *
 * Why 2025 (not the 2019 index): WIMD 2025 is published on the 2021 Census LSOA geography, so it
 * joins cleanly to postcodes.io's codes.lsoa. WIMD 2019 used 2011 LSOAs (1,909 of them, W01000001–
 * W01001958) which no longer match postcodes.io — e.g. central-Cardiff postcodes now resolve to
 * W01002019, a 2021 code absent from the 2019 file. Note postcodes.io's own deprivation field is the
 * stale 2019 rank for Wales, so we never use it — the overall figure comes from this dataset.
 *
 * The file only publishes domain *ranks* (the deciles sheet has the overall decile only), so we
 * convert each domain rank to a decile using WIMD's documented, non-uniform decile bands. The build
 * self-checks that those bands reproduce the official overall decile exactly before writing.
 *
 * Source: "WIMD 2025 index and domain ranks by small area" (ODS), Welsh Government, OGL v3.0.
 *   https://www.gov.wales/welsh-index-multiple-deprivation-2025
 *   npm run etl:wimd                # downloads the ODS
 *   npm run etl:wimd -- file.ods    # parse a local file
 */
import * as XLSX from "xlsx";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "wimd-by-lsoa.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const YEAR = "2025";
const URL =
  "https://www.gov.wales/sites/default/files/statistics-and-research/2025-11/wimd-2025-index-and-domain-ranks-by-small-area.ods";
const RANKS_SHEET = "WIMD_2025_ranks";
const DECILES_SHEET = "Deciles_quintiles_quartiles";

// WIMD 2025 decile band upper-bounds for 1,917 ranked LSOAs (from the file's guidance sheet). Bands
// are 191–193 wide, so no single divisor works — map a rank to the first band whose bound it's within.
const DECILE_BOUNDS = [191, 382, 574, 766, 958, 1149, 1341, 1533, 1724, 1917];
const decileOf = (rank) => {
  for (let i = 0; i < DECILE_BOUNDS.length; i++) if (rank <= DECILE_BOUNDS[i]) return i + 1;
  return 10;
};

// header text → output key, in panel order (Income … Physical Environment)
const DOMAINS = [
  [/^income$/i, "income"],
  [/^employment$/i, "employment"],
  [/^health$/i, "health"],
  [/^education$/i, "education"],
  [/^access to services$/i, "access"],
  [/^housing$/i, "housing"],
  [/^community safety$/i, "community"],
  [/^physical environment$/i, "physical"],
];

// SheetJS's ESM build doesn't bind fs, so use XLSX.read(buffer) (not readFile) — same as build-income.
async function loadWorkbook(arg) {
  if (arg) return XLSX.read(readFileSync(arg), { type: "buffer" });
  console.log("Downloading WIMD 2025 index and domain ranks (gov.wales)…");
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`gov.wales returned ${res.status}`);
  return XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
}

function sheetRows(wb, name) {
  const sheet = wb.Sheets[name];
  if (!sheet) throw new Error(`sheet "${name}" not found (${wb.SheetNames.join(", ")})`);
  return XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });
}

const norm = (v) => String(v ?? "").trim();
const findHeader = (rows) => rows.findIndex((r) => Array.isArray(r) && r.some((c) => /^LSOA code$/i.test(norm(c))));

async function main() {
  const wb = await loadWorkbook(process.argv[2]);

  // --- ranks sheet: overall rank + the eight domain ranks ---
  const rRows = sheetRows(wb, RANKS_SHEET);
  const rHdrIdx = findHeader(rRows);
  if (rHdrIdx < 0) throw new Error(`'LSOA code' header not found in ${RANKS_SHEET}`);
  const rHdr = rRows[rHdrIdx].map(norm);
  const iCode = rHdr.findIndex((h) => /^LSOA code$/i.test(h));
  const iOverall = rHdr.findIndex((h) => /^WIMD \d{4}$/i.test(h));
  if (iOverall < 0) throw new Error("overall WIMD rank column not found");
  const domainCols = DOMAINS.map(([re, key]) => {
    const i = rHdr.findIndex((h) => re.test(h));
    if (i < 0) throw new Error(`domain column not found: ${key}`);
    return [i, key];
  });

  const rank = (v) => {
    const n = Number(norm(v));
    return Number.isInteger(n) && n >= 1 ? n : null;
  };

  const byLsoa = {};
  for (let r = rHdrIdx + 1; r < rRows.length; r++) {
    const row = rRows[r];
    if (!Array.isArray(row)) continue;
    const code = norm(row[iCode]);
    if (!/^W01\d{6}$/.test(code)) continue; // Welsh LSOAs only
    const overall = rank(row[iOverall]);
    if (overall == null) continue;
    const rec = { rank: overall, decile: decileOf(overall) };
    for (const [i, key] of domainCols) {
      const dr = rank(row[i]);
      rec[key] = dr == null ? null : decileOf(dr);
    }
    byLsoa[code] = rec;
  }

  const codes = Object.keys(byLsoa);
  if (codes.length < 1900) throw new Error(`only ${codes.length} LSOAs — looks truncated, refusing to write`);

  // --- self-check: our decile bands must reproduce the official overall decile exactly ---
  const dRows = sheetRows(wb, DECILES_SHEET);
  const dHdrIdx = findHeader(dRows);
  if (dHdrIdx < 0) throw new Error(`'LSOA code' header not found in ${DECILES_SHEET}`);
  const dHdr = dRows[dHdrIdx].map(norm);
  const dCode = dHdr.findIndex((h) => /^LSOA code$/i.test(h));
  const dDec = dHdr.findIndex((h) => /overall decile/i.test(h));
  if (dDec < 0) throw new Error("official 'overall decile' column not found");
  let checked = 0;
  let mismatches = 0;
  for (let r = dHdrIdx + 1; r < dRows.length; r++) {
    const row = dRows[r];
    if (!Array.isArray(row)) continue;
    const code = norm(row[dCode]);
    const rec = byLsoa[code];
    if (!rec) continue;
    checked++;
    if (rec.decile !== Number(norm(row[dDec]))) mismatches++;
  }
  if (mismatches > 0)
    throw new Error(`decile bands disagree with official deciles in ${mismatches}/${checked} LSOAs — bands may have changed`);
  console.log(`Decile self-check passed: ${checked} LSOAs match the official overall decile.`);

  await writeFile(OUT, JSON.stringify({ year: YEAR, count: codes.length, byLsoa }) + "\n");
  console.log(`Wrote ${codes.length} LSOA WIMD ${YEAR} records → ${OUT}`);
  for (const c of ["W01000003", "W01002019"]) {
    const x = byLsoa[c];
    if (x) console.log(`  sample ${c}: rank ${x.rank}/${codes.length} (decile ${x.decile})`);
  }
}

main().catch((e) => {
  console.error("WIMD ETL failed:", e.message);
  process.exit(1);
});
