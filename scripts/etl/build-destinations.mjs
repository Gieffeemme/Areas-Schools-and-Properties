#!/usr/bin/env node
/**
 * Build src/data/destinations-by-urn.json from DfE KS4 + KS5 destination measures, keyed by URN.
 * KS4 (after GCSEs): % sustained, education, apprenticeship, employment, not-sustained.
 * KS5 (after sixth form): % sustained, higher education (university), FE, apprenticeship, employment.
 *
 * Source: DfE "Compare School Performance" download-data (filters=KS4DESTINATION / KS5DESTINATION).
 *   npm run etl:destinations           # 2022-2023
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "destinations-by-urn.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const url = (filter, year) =>
  "https://www.compare-school-performance.service.gov.uk/download-data" +
  `?download=true&regions=0&filters=${filter}&fileformat=csv&year=${year}&meta=false`;

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

async function fetchLines(filter, year) {
  console.log("Fetching", filter, year, "…");
  const res = await fetch(url(filter, year), { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${filter} download failed: HTTP ${res.status}`);
  return (await res.text()).replace(/^﻿/, "").split(/\r?\n/);
}

function ingest(lines, cols) {
  const h = parseLine(lines[0]);
  const idx = Object.fromEntries(Object.entries(cols).map(([k, name]) => [k, h.indexOf(name)]));
  const recs = {};
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    const x = parseLine(lines[r]);
    const urn = (x[idx.urn] ?? "").trim();
    if (!/^\d+$/.test(urn)) continue;
    const rec = {};
    for (const [k, ci] of Object.entries(idx)) {
      if (k === "urn") continue;
      rec[k] = ci >= 0 ? num(x[ci]) : null;
    }
    if (Object.values(rec).some((v) => v !== null)) recs[urn] = rec;
  }
  return recs;
}

async function main() {
  const arg = process.argv[2];
  const year = arg && /^\d{4}-\d{4}$/.test(arg) ? arg : "2022-2023";

  const ks4 = ingest(await fetchLines("KS4DESTINATION", year), {
    urn: "URN",
    sustained: "OVERALL_DESTPER",
    education: "EDUCATIONPER",
    appren: "APPRENPER",
    employment: "EMPLOYMENTPER",
    notSustained: "NOT_SUSTAINEDPER",
  });
  const ks5 = ingest(await fetchLines("KS5DESTINATION", year), {
    urn: "URN",
    sustained: "TOT_OVERALLPER",
    he: "TOT_HEPER",
    fe: "TOT_FEPER",
    appren: "TOT_APPRENPER",
    employment: "TOT_EMPLOYMENTPER",
  });

  const out = {};
  for (const [urn, rec] of Object.entries(ks4)) (out[urn] ||= {}).ks4 = rec;
  for (const [urn, rec] of Object.entries(ks5)) (out[urn] ||= {}).ks5 = rec;

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${Object.keys(out).length} destination records → ${OUT}`);
}

main().catch((e) => {
  console.error("destinations ETL failed:", e.message);
  process.exit(1);
});
