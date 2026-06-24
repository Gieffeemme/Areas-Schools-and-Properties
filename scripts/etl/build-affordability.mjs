#!/usr/bin/env node
/**
 * Build src/data/affordability-by-laua.json from ONS "Ratio of house price to workplace-based earnings"
 * — table 5c (median house price ÷ median gross annual workplace-based earnings) by local authority
 * district, England & Wales. Keyed by LA code (postcodes.io codes.admin_district = facts.lauaCode), the
 * same join as broadband/mobile. Also stores the E&W median ratio for context. A higher ratio = less
 * affordable (homes cost more multiples of local earnings).
 *
 * Source: the "aff1…earnings.xlsx" on the ONS release page (OGL); the `/current/` path is always latest.
 * Sheet "5c": columns Country/Region code+name, Local authority code+name, then a column per "Year ending
 * Sep <YYYY>" (+ a trailing "5-Year Average"); we take the latest single year.
 *   npm run etl:affordability                 # downloads the current file
 *   npm run etl:affordability -- file.xlsx     # parse a local file
 */
import * as XLSX from "xlsx";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "affordability-by-laua.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const URL =
  "https://www.ons.gov.uk/file?uri=/peoplepopulationandcommunity/housing/datasets/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian/current/aff1ratioofhousepricetoworkplacebasedearnings.xlsx";
const SHEET = "5c"; // median affordability ratio by local authority district

async function loadWorkbook(arg) {
  if (arg) return XLSX.read(readFileSync(arg), { type: "buffer" });
  console.log("Downloading ONS affordability ratios…");
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`ONS returned ${res.status}`);
  return XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
}

const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round(((a[m - 1] + a[m]) / 2) * 100) / 100;
};

async function main() {
  const wb = await loadWorkbook(process.argv[2]);
  const sheet = wb.Sheets[SHEET];
  if (!sheet) throw new Error(`sheet "${SHEET}" not found (${wb.SheetNames.join(", ")})`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const hdrIdx = rows.findIndex((r) => Array.isArray(r) && r.includes("Local authority code"));
  if (hdrIdx < 0) throw new Error("header row with 'Local authority code' not found");
  const hdr = rows[hdrIdx];
  const iCode = hdr.indexOf("Local authority code");
  // The latest single year = the rightmost column ending in a 4-digit year ("2025" or "Year ending Sep
  // 2025"), skipping the trailing "5-Year Average".
  let iLatest = -1;
  let year = "";
  for (let c = 0; c < hdr.length; c++) {
    const m = String(hdr[c] ?? "").match(/((?:19|20)\d{2})$/);
    if (m) {
      iLatest = c;
      year = m[1];
    }
  }
  if (iLatest < 0) throw new Error("no year column found");

  const byLaua = {};
  for (let r = hdrIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const code = String(row[iCode] ?? "").trim();
    if (!/^[EW]0[6-9]\d{6}$/.test(code)) continue; // England + Wales LA districts/UAs
    const v = Number(row[iLatest]);
    if (!Number.isFinite(v) || v <= 0) continue;
    byLaua[code] = Math.round(v * 10) / 10;
  }

  const codes = Object.keys(byLaua);
  if (codes.length < 300) throw new Error(`only ${codes.length} LAs — looks truncated, refusing to write`);
  const med = median(Object.values(byLaua));

  await writeFile(OUT, JSON.stringify({ year, median: med, byLaua }) + "\n");
  console.log(`Wrote ${codes.length} local authorities (median affordability ratio, ${year}) → ${OUT}`);
  console.log(`  E&W median ratio: ${med}`);
  for (const c of ["E08000003", "E09000033", "E09000020"]) if (byLaua[c]) console.log(`  sample ${c}: ${byLaua[c]}×`);
}

main().catch((e) => {
  console.error("affordability ETL failed:", e.message);
  process.exit(1);
});
