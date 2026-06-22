#!/usr/bin/env node
/**
 * Build src/data/ks4-by-urn.json from DfE KS4 (GCSE) performance tables, keyed by URN:
 * Progress 8 (P8MEA), Attainment 8 (ATT8SCR), % grade 5+ and 4+ in English & Maths — the headline
 * "basics" pass rates (PTL2BASICS_95 / PTL2BASICS_94), EBacc entry % (PTEBACC_E_PTQ_EE), EBacc
 * achieved 9-4 % (PTEBACC_94), and disadvantaged Progress 8 (P8MEA_FSM6CLA1A). Secondary only.
 *
 * Source: DfE "Compare School Performance" download-data (direct CSV; needs a browser UA).
 *   npm run etl:ks4                          # 2022-2023
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
    console.log("Fetching KS4", year, "from DfE…");
    const res = await fetch(downloadUrl(year), { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    text = await res.text();
  }

  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const hdr = parseLine(lines[0]);
  const i = (n) => hdr.indexOf(n);
  const iURN = i("URN");
  const iP8 = i("P8MEA");
  const iAtt = i("ATT8SCR");
  const iEbE = i("PTEBACC_E_PTQ_EE");
  const iEb94 = i("PTEBACC_94");
  const iDis = i("P8MEA_FSM6CLA1A");
  const iEm5 = i("PTL2BASICS_95"); // % grade 5+ (strong pass) in English & Maths
  const iEm4 = i("PTL2BASICS_94"); // % grade 4+ (standard pass) in English & Maths
  if (iURN < 0 || iP8 < 0) throw new Error("Expected 'URN' and 'P8MEA' columns in the KS4 CSV.");

  const out = {};
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    const row = parseLine(lines[r]);
    const urn = (row[iURN] ?? "").trim();
    if (!urn) continue;
    const p8 = num(row[iP8]);
    const att8 = iAtt >= 0 ? num(row[iAtt]) : null;
    if (p8 === null && att8 === null) continue;
    out[urn] = {
      p8,
      att8,
      em5: iEm5 >= 0 ? num(row[iEm5]) : null,
      em4: iEm4 >= 0 ? num(row[iEm4]) : null,
      ebaccEntry: iEbE >= 0 ? num(row[iEbE]) : null,
      ebacc94: iEb94 >= 0 ? num(row[iEb94]) : null,
      disP8: iDis >= 0 ? num(row[iDis]) : null,
      year: yearLabel,
    };
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${Object.keys(out).length} KS4 records (${yearLabel}) → ${OUT}`);
}

main().catch((e) => {
  console.error("KS4 ETL failed:", e.message);
  process.exit(1);
});
