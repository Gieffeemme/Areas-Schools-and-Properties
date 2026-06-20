#!/usr/bin/env node
/**
 * Build src/data/census-by-urn.json from the DfE school census (pupil characteristics), keyed by
 * URN: % FSM (eligible in the last 6 years — the disadvantage proxy), % EAL, % SEN with an EHC
 * plan, % SEN support.
 *
 * Source: DfE "Compare School Performance" download-data (filters=CENSUS; direct CSV, browser UA).
 *   npm run etl:census                 # 2022-2023
 *   node scripts/etl/build-census.mjs 2021-2022
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "census-by-urn.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const url = (year) =>
  "https://www.compare-school-performance.service.gov.uk/download-data" +
  `?download=true&regions=0&filters=CENSUS&fileformat=csv&year=${year}&meta=false`;

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
  const year = arg && /^\d{4}-\d{4}$/.test(arg) ? arg : "2022-2023";
  console.log("Fetching census", year, "from DfE…");
  const res = await fetch(url(year), { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const lines = (await res.text()).replace(/^﻿/, "").split(/\r?\n/);

  const h = parseLine(lines[0]);
  const i = (n) => h.indexOf(n);
  const iU = i("URN");
  const iFsm = i("PNUMFSMEVER");
  const iEal = i("PNUMEAL");
  const iEhcp = i("PSENELSE");
  const iSup = i("PSENELK");
  if (iU < 0) throw new Error("Expected a 'URN' column in the census CSV.");

  const out = {};
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    const x = parseLine(lines[r]);
    const urn = (x[iU] ?? "").trim();
    if (!/^\d+$/.test(urn)) continue;
    const rec = {
      fsm: num(x[iFsm]),
      eal: num(x[iEal]),
      senEhcp: num(x[iEhcp]),
      senSupport: num(x[iSup]),
    };
    if (Object.values(rec).some((v) => v !== null)) out[urn] = rec;
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${Object.keys(out).length} census records → ${OUT}`);
}

main().catch((e) => {
  console.error("census ETL failed:", e.message);
  process.exit(1);
});
