#!/usr/bin/env node
/**
 * Build src/data/ks4-by-urn.json from DfE KS4 (GCSE) performance tables — Progress 8 (P8MEA)
 * and Attainment 8 (ATT8SCR) per URN. KS4 is a secondary measure, so only secondary schools
 * appear (primaries have no Progress 8).
 *
 * Source: DfE "Compare School Performance" download-data — a direct CSV (needs a browser UA).
 *
 * Usage:
 *   npm run etl:ks4                          # 2022-2023 (default)
 *   node scripts/etl/build-ks4.mjs 2021-2022
 *   node scripts/etl/build-ks4.mjs ./england_ks4final.csv
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "ks4-by-urn.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function downloadUrl(year) {
  return (
    "https://www.compare-school-performance.service.gov.uk/download-data" +
    `?download=true&regions=0&filters=KS4&fileformat=csv&year=${year}&meta=false`
  );
}

function parseLine(l) {
  const out = [];
  let f = "";
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) {
      if (c === '"') {
        if (l[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(f);
      f = "";
    } else f += c;
  }
  out.push(f);
  return out;
}

function num(v) {
  const s = (v ?? "").trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
}

async function main() {
  const arg = process.argv[2];
  const isYear = arg && /^\d{4}-\d{4}$/.test(arg);
  const year = isYear ? arg : "2022-2023";
  const yearLabel = `${year.slice(0, 4)}/${year.slice(7, 9)}`; // 2022-2023 -> 2022/23

  let text;
  if (arg && !isYear) {
    console.log("Reading local CSV:", arg);
    text = await readFile(arg, "utf8");
  } else {
    console.log("Fetching KS4", year, "from DfE…");
    const res = await fetch(downloadUrl(year), { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    text = await res.text();
  }

  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const hdr = parseLine(lines[0]);
  const iURN = hdr.indexOf("URN");
  const iP8 = hdr.indexOf("P8MEA");
  const iAtt = hdr.indexOf("ATT8SCR");
  if (iURN < 0 || iP8 < 0) throw new Error("Expected 'URN' and 'P8MEA' columns in the KS4 CSV.");

  const out = {};
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const r = parseLine(lines[i]);
    const urn = (r[iURN] ?? "").trim();
    if (!urn) continue;
    const p8 = num(r[iP8]);
    const att8 = iAtt >= 0 ? num(r[iAtt]) : null;
    if (p8 === null && att8 === null) continue; // skip suppressed / no-entry rows
    out[urn] = { p8, att8, year: yearLabel };
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${Object.keys(out).length} KS4 records (${yearLabel}) → ${OUT}`);
}

main().catch((e) => {
  console.error("KS4 ETL failed:", e.message);
  process.exit(1);
});
