#!/usr/bin/env node
/**
 * Build src/data/ks5-by-urn.json from DfE KS5 (16-18 / A level) performance tables, keyed by URN:
 *   grade   — average result per A level entry, as a grade (TALLPPEGRD_ALEV_1618, e.g. "B-")
 *   aps     — average point score per A level entry (TALLPPE_ALEV_1618, A*=60…E=10 scale)
 *   aabFac  — % achieving AAB+ incl. >=2 facilitating subjects (PTAAB_2FAC)
 *   pupils  — A level cohort size (TALLPUP_ALEV_1618)
 * Only schools/colleges with a sixth form appear. Sentinels in the source: NE / NA / NP / "" -> null.
 *
 * Source: DfE "Compare School Performance" download-data (filters=KS5; direct CSV, needs browser UA).
 *   npm run etl:ks5                          # 2022-2023
 *   node scripts/etl/build-ks5.mjs 2021-2022
 *   node scripts/etl/build-ks5.mjs ./england_ks5final.csv
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "ks5-by-urn.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

function downloadUrl(year) {
  return (
    "https://www.compare-school-performance.service.gov.uk/download-data" +
    `?download=true&regions=0&filters=KS5&fileformat=csv&year=${year}&meta=false`
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

// DfE grades: A*, A+, A, A-, B+ … E-, U. Reject sentinels (NE/NA/NP/SUPP/"").
const grade = (v) => {
  const s = (v ?? "").trim();
  return /^(A\*|[A-EU])[+-]?$/.test(s) ? s : null;
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
    console.log("Fetching KS5", year, "from DfE…");
    const res = await fetch(downloadUrl(year), { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    text = await res.text();
  }

  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const hdr = parseLine(lines[0]);
  const i = (n) => hdr.indexOf(n);
  const iURN = i("URN");
  const iGrade = i("TALLPPEGRD_ALEV_1618");
  const iAps = i("TALLPPE_ALEV_1618");
  const iAab = i("PTAAB_2FAC");
  const iPup = i("TALLPUP_ALEV_1618");
  if (iURN < 0 || iAps < 0)
    throw new Error("Expected 'URN' and 'TALLPPE_ALEV_1618' columns in the KS5 CSV.");

  const out = {};
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    const row = parseLine(lines[r]);
    const urn = (row[iURN] ?? "").trim();
    if (!/^\d+$/.test(urn)) continue;
    const g = iGrade >= 0 ? grade(row[iGrade]) : null;
    const aps = num(row[iAps]);
    if (g === null && aps === null) continue; // no A level results -> skip (e.g. no sixth form)
    out[urn] = {
      grade: g,
      aps,
      aabFac: iAab >= 0 ? num(row[iAab]) : null,
      pupils: iPup >= 0 ? num(row[iPup]) : null,
      year: yearLabel,
    };
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${Object.keys(out).length} KS5 (A level) records (${yearLabel}) → ${OUT}`);
}

main().catch((e) => {
  console.error("KS5 ETL failed:", e.message);
  process.exit(1);
});
