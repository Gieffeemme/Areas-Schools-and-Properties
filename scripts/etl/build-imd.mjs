#!/usr/bin/env node
/**
 * Build src/data/imd-domains-by-lsoa.json from MHCLG's English Indices of Deprivation 2019
 * (File 7 — all ranks, deciles and scores), keyed by LSOA 2011 code: the decile (1 = most deprived
 * 10% of LSOAs, 10 = least) for each of the seven IMD domains. The app already gets the *overall*
 * IMD decile live from postcodes.io; this adds the per-domain breakdown by LSOA-code join.
 *   npm run etl:imd
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "imd-domains-by-lsoa.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
// IoD2019 File 7 (CSV). Column names carry commas, so they must be parsed with quote handling.
const URL =
  "https://assets.publishing.service.gov.uk/media/5dc407b440f0b6379a7acc8d/File_7_-_All_IoD2019_Scores__Ranks__Deciles_and_Population_Denominators_3.csv";

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

const dec = (v) => {
  const n = Number(String(v ?? "").trim());
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
};

async function main() {
  console.log("Fetching IoD2019 File 7 (domain deciles by LSOA) from gov.uk…");
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const lines = (await res.text()).replace(/^﻿/, "").split(/\r?\n/);

  const h = parseLine(lines[0]);
  const find = (re) => h.findIndex((c) => re.test(String(c ?? "").trim()));
  const cols = {
    code: find(/^LSOA code \(2011\)$/i),
    income: find(/^Income Decile/i),
    employment: find(/^Employment Decile/i),
    education: find(/Skills and Training Decile/i),
    health: find(/^Health Deprivation and Disability Decile/i),
    crime: find(/^Crime Decile/i),
    housing: find(/^Barriers to Housing and Services Decile/i),
    living: find(/^Living Environment Decile/i),
  };
  for (const [k, i] of Object.entries(cols)) if (i < 0) throw new Error(`column not found: ${k}`);

  const out = {};
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    const x = parseLine(lines[r]);
    const code = (x[cols.code] ?? "").trim();
    if (!/^E01\d{6}$/.test(code)) continue; // English LSOAs only
    out[code] = {
      income: dec(x[cols.income]),
      employment: dec(x[cols.employment]),
      education: dec(x[cols.education]),
      health: dec(x[cols.health]),
      crime: dec(x[cols.crime]),
      housing: dec(x[cols.housing]),
      living: dec(x[cols.living]),
    };
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${Object.keys(out).length} LSOA domain records → ${OUT}`);
}

main().catch((e) => {
  console.error("IMD ETL failed:", e.message);
  process.exit(1);
});
