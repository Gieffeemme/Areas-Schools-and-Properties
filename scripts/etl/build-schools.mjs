#!/usr/bin/env node
/**
 * Build src/data/ofsted-by-urn.json from Ofsted's "state-funded schools inspections and
 * outcomes" management information (xlsx), keyed by URN: overall grade + sub-grades
 * (quality of education, behaviour, personal development, leadership, EYFS, sixth form),
 * the inspection date, and a link to the school's Ofsted report.
 *
 * GIAS does NOT contain Ofsted grades — they live in this separate Ofsted dataset.
 * Source: https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes
 * (Latest cleanly-structured workbook is as at Nov 2019; Ofsted retired overall grades Sept 2024.)
 *
 *   npm run etl:schools
 *   node scripts/etl/build-schools.mjs <url|file.xlsx>
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
const grade = (v) => GRADE[String(v ?? "").trim()];

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
  const col = (n) => hdr.indexOf(n);

  const iU = col("URN");
  const iName = col("School name");
  const iDate = col("Inspection start date");
  const iWeb = col("Web link");
  const iOverall = col("Overall effectiveness");
  const SUB = {
    education: col("Quality of education"),
    behaviour: col("Behaviour and attitudes"),
    personal: col("Personal development"),
    leadership: col("Effectiveness of leadership and management"),
    eyfs: col("Early years provision (where applicable)"),
    sixthForm: col("Sixth form provision (where applicable)"),
  };
  if (iU < 0 || iOverall < 0) {
    throw new Error("Expected 'URN' and 'Overall effectiveness' columns.");
  }

  const out = {};
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    const urn = String(row[iU] ?? "").trim();
    const rating = grade(row[iOverall]);
    if (!/^\d+$/.test(urn) || !rating) continue;

    const sub = {};
    for (const [k, i] of Object.entries(SUB)) {
      if (i >= 0) {
        const g = grade(row[i]);
        if (g) sub[k] = g;
      }
    }
    const web = iWeb >= 0 ? String(row[iWeb] ?? "").trim() : "";

    out[urn] = {
      rating,
      date: iDate >= 0 ? isoDate(row[iDate]) : undefined,
      name: iName >= 0 ? String(row[iName] ?? "").trim() || undefined : undefined,
      report: web.startsWith("http") ? web : undefined,
      sub: Object.keys(sub).length ? sub : undefined,
    };
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${Object.keys(out).length} Ofsted records (overall + sub-grades) → ${OUT}`);
}

main().catch((e) => {
  console.error("ETL failed:", e.message);
  process.exit(1);
});
