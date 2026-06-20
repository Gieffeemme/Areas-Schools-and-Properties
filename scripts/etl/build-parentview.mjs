#!/usr/bin/env node
/**
 * Build src/data/parentview-by-urn.json from Ofsted's "Parent View: management information"
 * (xlsx), keyed by URN. We extract the headline happiness figure — % of parents who agree or
 * strongly agree with Q1 "My child is happy at this school" — plus the response count so the UI
 * can weight low-N results.
 *
 * Source: https://www.gov.uk/government/statistical-data-sets/ofsted-parent-view-management-information
 * The "School Level Data" sheet stores each question's responses as proportions (sum ~1).
 *
 * Usage:
 *   npm run etl:parentview                          # latest file from gov.uk
 *   node scripts/etl/build-parentview.mjs <url>
 *   node scripts/etl/build-parentview.mjs ./file.xlsx
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as XLSX from "xlsx";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "parentview-by-urn.json");
const PAGE =
  "https://www.gov.uk/government/statistical-data-sets/ofsted-parent-view-management-information";
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function fileTimestamp(u) {
  const f = decodeURIComponent(u);
  const m = f.match(/as_at_(\d{1,2})_([A-Za-z]+)_(\d{4})/);
  return m ? Date.UTC(+m[3], (MONTHS[m[2].toLowerCase()] || 1) - 1, +m[1]) : 0;
}

async function getWorkbook() {
  const arg = process.argv[2];
  if (arg && !arg.startsWith("http")) {
    console.log("Reading local file:", arg);
    return { wb: XLSX.read(await readFile(arg), { type: "buffer" }), label: arg };
  }
  let url = arg;
  if (!url) {
    const page = await (await fetch(PAGE)).text();
    const urls = [
      ...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"]+\.xlsx/g),
    ].map((m) => m[0]);
    url = urls.sort((a, b) => fileTimestamp(b) - fileTimestamp(a))[0];
    if (!url) throw new Error("No Parent View MI .xlsx link found on gov.uk.");
  }
  const label = decodeURIComponent(url.split("/").pop());
  console.log("Fetching:", label);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  return { wb: XLSX.read(buf, { type: "buffer" }), label };
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

async function main() {
  const { wb, label } = await getWorkbook();
  const sheet =
    wb.Sheets["School Level Data"] ||
    wb.Sheets[wb.SheetNames.find((n) => /school level/i.test(n)) ?? ""];
  if (!sheet) throw new Error("No 'School Level Data' sheet in the workbook.");

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  const hi = rows.findIndex((r) => String(r[0]).trim().toLowerCase() === "urn");
  if (hi < 0) throw new Error("Could not find the URN header row.");
  const hdr = rows[hi].map((h) => String(h).trim());
  const iSub = hdr.indexOf("Submissions");
  const iQ1 = hdr.indexOf("Q1 Strongly Agree"); // followed by Agree, Disagree, Strongly Disagree, Don't Know
  if (iQ1 < 0) throw new Error("Could not find the 'Q1 Strongly Agree' column.");

  const out = {};
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    const urn = String(row[0] ?? "").trim();
    if (!/^\d+$/.test(urn)) continue;
    const sa = num(row[iQ1]);
    const a = num(row[iQ1 + 1]);
    const d = num(row[iQ1 + 2]);
    const sd = num(row[iQ1 + 3]);
    const dk = num(row[iQ1 + 4]);
    const base = sa + a + d + sd + dk;
    if (base <= 0) continue;
    out[urn] = {
      happy: Math.round(((sa + a) / base) * 100),
      responses: iSub >= 0 ? num(row[iSub]) : undefined,
    };
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${Object.keys(out).length} Parent View records (${label}) → ${OUT}`);
}

main().catch((e) => {
  console.error("Parent View ETL failed:", e.message);
  process.exit(1);
});
