#!/usr/bin/env node
/**
 * Build src/data/ofsted-by-urn.json from Ofsted's official "state-funded schools inspections
 * and outcomes" management information (xlsx), keyed by URN. The app joins these onto live
 * OpenStreetMap school pins via the URN (OSM tag `ref:edubase`).
 *
 * NOTE: GIAS (the schools register) does NOT contain Ofsted grades — they live in this separate
 * Ofsted dataset. Each grade is stored with its inspection date so the UI can show provenance.
 *
 * Source page:
 *   https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes
 * Caveat: the latest cleanly-structured workbook there is "state-funded schools ... as at Nov
 * 2019"; Ofsted abolished single 'overall effectiveness' grades in Sept 2024, so pre-2024
 * inspections are where overall grades still exist.
 *
 * Usage:
 *   npm run etl:schools                        # auto-pick the state-funded MI from gov.uk
 *   node scripts/etl/build-schools.mjs <url>   # a specific .xlsx URL
 *   node scripts/etl/build-schools.mjs ./file.xlsx
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as XLSX from "xlsx";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "ofsted-by-urn.json");
const PAGE =
  "https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes";

const GRADE = { "1": "Outstanding", "2": "Good", "3": "Requires improvement", "4": "Inadequate" };

async function getWorkbook() {
  const arg = process.argv[2];
  if (arg && !arg.startsWith("http")) {
    console.log("Reading local file:", arg);
    return XLSX.read(await readFile(arg), { type: "buffer" });
  }
  let url = arg;
  if (!url) {
    const page = await (await fetch(PAGE)).text();
    const urls = [
      ...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"]+\.xlsx/g),
    ].map((m) => m[0]);
    url = urls.find((u) => /state.funded/i.test(decodeURIComponent(u))) || urls[0];
    if (!url) throw new Error("No Ofsted MI .xlsx link found on the gov.uk page.");
  }
  console.log("Fetching:", decodeURIComponent(url.split("/").pop()));
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  return XLSX.read(buf, { type: "buffer" });
}

function isoDate(v) {
  if (typeof v === "number" && v > 0) {
    return new Date(Math.round((v - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  }
  if (typeof v === "string" && v && v !== "NULL") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return undefined;
}

async function main() {
  const wb = await getWorkbook();
  const sheetName =
    wb.SheetNames.find((n) => /most recent inspections/i.test(n)) ||
    wb.SheetNames.find((n) => /inspection/i.test(n)) ||
    wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, blankrows: false });

  const hi = rows.findIndex((r) => r.some((c) => String(c).trim().toLowerCase() === "urn"));
  if (hi < 0) throw new Error("Could not find a header row containing a URN column.");
  const hdr = rows[hi].map((h) => String(h).trim());
  const col = (re) => hdr.findIndex((h) => re.test(h));
  const iUrn = col(/^urn$/i);
  const iName = col(/^school name$/i);
  const iOverall = col(/^overall effectiveness$/i);
  const iDate = col(/^inspection start date$/i);
  if (iUrn < 0 || iOverall < 0) {
    throw new Error("Expected 'URN' and 'Overall effectiveness' columns in the Ofsted MI sheet.");
  }

  const out = {};
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    const urn = String(row[iUrn] ?? "").trim();
    const rating = GRADE[String(row[iOverall] ?? "").trim()];
    if (!urn || !rating) continue;
    out[urn] = {
      rating,
      date: iDate >= 0 ? isoDate(row[iDate]) : undefined,
      name: iName >= 0 ? String(row[iName] ?? "").trim() || undefined : undefined,
    };
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${Object.keys(out).length} Ofsted-graded schools (sheet "${sheetName}") → ${OUT}`);
}

main().catch((e) => {
  console.error("ETL failed:", e.message);
  process.exit(1);
});
