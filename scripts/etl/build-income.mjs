#!/usr/bin/env node
/**
 * Build src/data/income-by-msoa.json from ONS "Income estimates for small areas" — model-based net
 * (disposable) annual household income per MSOA, England & Wales. Keyed by MSOA code (postcodes.io
 * returns codes.msoa / codes.msoa21), so the area report shows the neighbourhood's typical income with
 * no per-postcode dataset. Also stores the national median, for context.
 *
 * Source: the "datasetfinal.xlsx" on the ONS release page (OGL), "Net annual income" sheet — columns
 * "MSOA code" + "Disposable (net) annual income (£)". Financial year ending 2023.
 *   https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/smallareaincomeestimatesformiddlelayersuperoutputareasenglandandwales
 *   npm run etl:income                 # downloads the FYE2023 file
 *   npm run etl:income -- file.xlsx    # parse a local file
 */
import * as XLSX from "xlsx";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "income-by-msoa.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const YEAR = "2023"; // financial year ending March 2023
const URL =
  "https://www.ons.gov.uk/file?uri=/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/smallareaincomeestimatesformiddlelayersuperoutputareasenglandandwales/financialyearending2023/datasetfinal.xlsx";
const SHEET = "Net annual income";

// SheetJS's ESM build doesn't bind fs, so use XLSX.read(buffer) (not readFile) — same as build-finance.
async function loadWorkbook(arg) {
  if (arg) return XLSX.read(readFileSync(arg), { type: "buffer" });
  console.log("Downloading ONS small-area income…");
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`ONS returned ${res.status}`);
  return XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
}

const median = (arr) => {
  const a = [...arr].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : Math.round((a[m - 1] + a[m]) / 2);
};

async function main() {
  const wb = await loadWorkbook(process.argv[2]);
  const sheet = wb.Sheets[SHEET];
  if (!sheet) throw new Error(`sheet "${SHEET}" not found (${wb.SheetNames.join(", ")})`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  const hdrIdx = rows.findIndex((r) => Array.isArray(r) && r.includes("MSOA code"));
  if (hdrIdx < 0) throw new Error("header row with 'MSOA code' not found");
  const hdr = rows[hdrIdx];
  const iCode = hdr.indexOf("MSOA code");
  const iVal = hdr.findIndex((h) => typeof h === "string" && /disposable.*income/i.test(h));
  if (iVal < 0) throw new Error("'Disposable (net) annual income' column not found");

  const byMsoa = {};
  for (let r = hdrIdx + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    const code = String(row[iCode] ?? "").trim();
    if (!/^[EW]02\d{6}$/.test(code)) continue; // England + Wales MSOAs
    const v = Math.round(Number(row[iVal]));
    if (!Number.isFinite(v) || v <= 0) continue;
    byMsoa[code] = v;
  }

  const codes = Object.keys(byMsoa);
  if (codes.length < 5000) throw new Error(`only ${codes.length} MSOAs — looks truncated, refusing to write`);
  const med = median(Object.values(byMsoa));

  await writeFile(OUT, JSON.stringify({ year: YEAR, median: med, byMsoa }) + "\n");
  console.log(`Wrote ${codes.length} MSOAs (net income, FYE ${YEAR}) → ${OUT}`);
  console.log(`  national median: £${med.toLocaleString("en-GB")}`);
  for (const c of ["E02000977", "E02002483"]) if (byMsoa[c]) console.log(`  sample ${c}: £${byMsoa[c].toLocaleString("en-GB")}`);
}

main().catch((e) => {
  console.error("income ETL failed:", e.message);
  process.exit(1);
});
