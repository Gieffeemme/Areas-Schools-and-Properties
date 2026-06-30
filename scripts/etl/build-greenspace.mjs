#!/usr/bin/env node
/**
 * Build src/data/greenspace.json from the ONS "Access to gardens and public green space in Great
 * Britain" (April 2020, OS data). Two small-area liveability metrics, Great Britain (England, Wales,
 * Scotland; not NI):
 *   - byLsoa (keyed by 2011 LSOA / Scottish data zone, S01/E01/W01 → postcodes.io codes.lsoa11):
 *       nearest public green space distance (m) + number of green spaces within 1 km.
 *   - byMsoa (keyed by 2011 MSOA, E02/W02/S02 → postcodes.io codes.msoa): % of addresses with private
 *       outdoor space (a garden/yard).
 *
 * Source: ONS, OGL v3.0.
 *   https://www.ons.gov.uk/economy/environmentalaccounts/datasets/accesstogardensandpublicgreenspaceingreatbritain
 *   npm run etl:greenspace                          # downloads both XLSX
 *   npm run etl:greenspace -- parks.xlsx gardens.xlsx
 */
import * as XLSX from "xlsx";
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "greenspace.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const BASE = "https://www.ons.gov.uk/file?uri=/economy/environmentalaccounts/datasets/accesstogardensandpublicgreenspaceingreatbritain";
const PARKS_URL = `${BASE}/accesstopublicparksandplayingfieldsgreatbritainapril2020/ospublicgreenspacereferencetables.xlsx`;
const GARDENS_URL = `${BASE}/accesstogardenspacegreatbritainapril2020/osprivateoutdoorspacereferencetables.xlsx`;

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function load(url, localArg) {
  if (localArg) return XLSX.read(await readFile(localArg), { type: "buffer" });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`ONS returned ${res.status} for ${url.split("/").pop()}`);
  return XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
}

function rows(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`sheet "${name}" not found (${wb.SheetNames.join(", ")})`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
}

async function main() {
  const [parksArg, gardensArg] = process.argv.slice(2);

  // --- Parks (public green space) — single header row (row 0); keyed by 2011 LSOA / data zone ---
  const pr = rows(await load(PARKS_URL, parksArg), "LSOA Parks and Playing Fields");
  const ph = pr[0].map(norm);
  const iLsoa = ph.findIndex((c) => /^LSOA code$/i.test(c));
  const iDist = ph.findIndex((c) => /Average distance to nearest Park/i.test(c));
  const iWithin = ph.findIndex((c) => /Average number of Parks.*within 1,?000/i.test(c));
  if (iLsoa < 0 || iDist < 0 || iWithin < 0) throw new Error("parks columns not found");
  const byLsoa = {};
  for (let r = 1; r < pr.length; r++) {
    const code = norm(pr[r][iLsoa]);
    if (!/^[EWS]01\d{6}$/.test(code)) continue;
    const dist = num(pr[r][iDist]);
    const within = num(pr[r][iWithin]);
    if (dist == null) continue;
    byLsoa[code] = { dist: Math.round(dist), within: within == null ? null : Math.round(within) };
  }

  // --- Gardens (private outdoor space) — 2-row header (group row 0 + metric row 1); 2011 MSOA ---
  const gr = rows(await load(GARDENS_URL, gardensArg), "MSOA gardens");
  const iMsoa = gr[0].map(norm).findIndex((c) => /^MSOA code$/i.test(c));
  const sub = gr[1].map(norm);
  // the Total group's "% of addresses with private outdoor space" is the LAST such column
  let iPct = -1;
  for (let i = 0; i < sub.length; i++) if (/percentage of a.?dresses with private outdoor space/i.test(sub[i])) iPct = i;
  if (iMsoa < 0 || iPct < 0) throw new Error("gardens columns not found");
  const byMsoa = {};
  for (let r = 2; r < gr.length; r++) {
    const code = norm(gr[r][iMsoa]);
    if (!/^[EWS]02\d{6}$/.test(code)) continue;
    const frac = num(gr[r][iPct]);
    if (frac == null) continue;
    byMsoa[code] = Math.round(frac * 100); // fraction → %
  }

  const nL = Object.keys(byLsoa).length, nM = Object.keys(byMsoa).length;
  if (nL < 30000 || nM < 8000) throw new Error(`only ${nL} LSOAs / ${nM} MSOAs — looks truncated`);

  await writeFile(OUT, JSON.stringify({ byLsoa, byMsoa }) + "\n");
  console.log(`Wrote ${nL} LSOAs (green space) + ${nM} MSOAs (gardens) → ${OUT}`);
  for (const c of ["E01000002", "S01006506", "W01000001"]) if (byLsoa[c]) console.log(`  ${c}: nearest ${byLsoa[c].dist}m, ${byLsoa[c].within} within 1km`);
  for (const c of ["E02000001", "E02006902"]) if (byMsoa[c] != null) console.log(`  ${c}: ${byMsoa[c]}% with private outdoor space`);
}

main().catch((e) => {
  console.error("green space ETL failed:", e.message);
  process.exit(1);
});
