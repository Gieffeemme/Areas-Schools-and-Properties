#!/usr/bin/env node
/**
 * Build src/data/ks2-by-urn.json from DfE KS2 (primary) performance tables, keyed by URN:
 * reading / writing / maths progress (READPROG, WRITPROG, MATPROG) and the % reaching the
 * expected (PTRWM_EXP) and higher (PTRWM_HIGH) standard in reading, writing & maths combined.
 *
 * Source: DfE "Compare School Performance" download-data (direct CSV; needs a browser UA).
 *   npm run etl:ks2                          # 2022-2023
 *   node scripts/etl/build-ks2.mjs 2018-2019
 *   node scripts/etl/build-ks2.mjs ./england_ks2.csv
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "ks2-by-urn.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function downloadUrl(year) {
  return (
    "https://www.compare-school-performance.service.gov.uk/download-data" +
    `?download=true&regions=0&filters=KS2&fileformat=csv&year=${year}&meta=false`
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

const num = (v) => {
  const s = (v ?? "").trim().replace(/%$/, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

async function main() {
  const arg = process.argv[2];
  const isYear = arg && /^\d{4}-\d{4}$/.test(arg);
  const year = isYear ? arg : "2022-2023";
  const yearLabel = `${year.slice(0, 4)}/${year.slice(7, 9)}`;

  let text;
  if (arg && !isYear) {
    console.log("Reading local CSV:", arg);
    text = await readFile(arg, "utf8");
  } else {
    console.log("Fetching KS2", year, "from DfE…");
    const res = await fetch(downloadUrl(year), { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    text = await res.text();
  }

  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const hdr = parseLine(lines[0]);
  const i = (n) => hdr.indexOf(n);
  const iURN = i("URN");
  const iExp = i("PTRWM_EXP");
  const iHigh = i("PTRWM_HIGH");
  const iRead = i("READPROG");
  const iWrit = i("WRITPROG");
  const iMat = i("MATPROG");
  if (iURN < 0) throw new Error("Expected a 'URN' column in the KS2 CSV.");

  const out = {};
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    const row = parseLine(lines[r]);
    const urn = (row[iURN] ?? "").trim();
    if (!/^\d+$/.test(urn)) continue;
    const rec = {
      rwmExp: iExp >= 0 ? num(row[iExp]) : null,
      rwmHigh: iHigh >= 0 ? num(row[iHigh]) : null,
      readProg: iRead >= 0 ? num(row[iRead]) : null,
      writProg: iWrit >= 0 ? num(row[iWrit]) : null,
      matProg: iMat >= 0 ? num(row[iMat]) : null,
      year: yearLabel,
    };
    if (rec.rwmExp === null && rec.readProg === null && rec.matProg === null) continue;
    out[urn] = rec;
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${Object.keys(out).length} KS2 records (${yearLabel}) → ${OUT}`);
}

main().catch((e) => {
  console.error("KS2 ETL failed:", e.message);
  process.exit(1);
});
