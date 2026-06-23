#!/usr/bin/env node
/**
 * Build src/data/air-quality-by-grid.json — modelled annual-mean background NO2 and PM2.5 concentrations
 * on Defra's 1×1 km grid, keyed by OS grid cell so the area report can show "air quality here". Read at
 * runtime by src/lib/airQuality.ts as a committed-dataset lookup (no per-request call), pairing with the
 * noise panel.
 *
 * Source: Defra Pollution Climate Mapping (PCM) modelled background maps — free, no-key, Open Government
 * Licence. One national CSV per pollutant per year:
 *   NO2   https://uk-air.defra.gov.uk/datastore/pcm/mapno2<year>.csv
 *   PM2.5 https://uk-air.defra.gov.uk/datastore/pcm/mappm25<year>g.csv
 * Layout: 5 metadata rows (pollutant / year / metric / unit / blank), then a `gridcode,x,y,<col>` header,
 * then data. x,y are the OSGB easting/northing of the 1 km cell CENTRE (…500); the same gridcode aligns
 * both files. Covers Great Britain (England/Scotland/Wales); NI uses the Irish grid and isn't included.
 *   npm run etl:air-quality                       # latest year this script knows about
 *   npm run etl:air-quality -- no2.csv pm25.csv    # parse local CSVs (skips the download)
 */
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "air-quality-by-grid.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const YEAR = 2024;
const NO2_URL = `https://uk-air.defra.gov.uk/datastore/pcm/mapno2${YEAR}.csv`;
const PM25_URL = `https://uk-air.defra.gov.uk/datastore/pcm/mappm25${YEAR}g.csv`;

// 1 km cell key from an OSGB easting/northing (cell centre or any point inside it) — floor to the km.
const cellKey = (x, y) => `${Math.floor(x / 1000)}_${Math.floor(y / 1000)}`;
const round1 = (n) => Math.round(n * 10) / 10;

async function load(url, localArg) {
  if (localArg) return readFileSync(localArg, "utf8");
  console.log("Downloading", url);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status} (${url})`);
  return res.text();
}

// Parse a PCM CSV → Map<cellKey, value>. Data starts after the `gridcode,x,y,…` header row; the value
// is the 4th column. Sentinel "MISSING"/blank rows are skipped.
function parseGrid(csv) {
  const lines = csv.split(/\r?\n/);
  let start = lines.findIndex((l) => /^gridcode,/i.test(l));
  if (start < 0) throw new Error("PCM CSV: gridcode header row not found");
  const out = new Map();
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (!l) continue;
    const c = l.split(",");
    if (c.length < 4) continue;
    const x = Number(c[1]);
    const y = Number(c[2]);
    const v = Number(c[3]);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(v)) continue;
    out.set(cellKey(x, y), round1(v));
  }
  return out;
}

async function main() {
  const [no2Arg, pm25Arg] = [process.argv[2], process.argv[3]];
  const [no2Csv, pm25Csv] = await Promise.all([
    load(NO2_URL, no2Arg),
    load(PM25_URL, pm25Arg),
  ]);
  const no2 = parseGrid(no2Csv);
  const pm25 = parseGrid(pm25Csv);
  console.log(`Parsed cells — NO2: ${no2.size}, PM2.5: ${pm25.size}`);

  // Merge by cell: [no2, pm25]; null where a pollutant is missing for that cell (the two grids align,
  // so this is rare). Union of keys so nothing is dropped.
  const grid = {};
  for (const k of new Set([...no2.keys(), ...pm25.keys()])) {
    grid[k] = [no2.has(k) ? no2.get(k) : null, pm25.has(k) ? pm25.get(k) : null];
  }
  const n = Object.keys(grid).length;
  if (n < 100000) throw new Error(`only ${n} grid cells — looks truncated, refusing to write`);

  await writeFile(OUT, JSON.stringify({ year: YEAR, count: n, grid }) + "\n");
  console.log(`Wrote ${n} 1km cells (NO2 + PM2.5, ${YEAR}) → ${OUT}`);
  // Sample: central London (TQ 530,180 → key "530_179"), should be elevated NO2.
  for (const [label, e, n2] of [["London SW1", 529090, 179645], ["rural mid-Wales", 280000, 270000]]) {
    const c = grid[cellKey(e, n2)];
    if (c) console.log(`  sample ${label}: NO2 ${c[0]} · PM2.5 ${c[1]} µg/m³`);
  }
}

main().catch((e) => {
  console.error("air-quality ETL failed:", e.message);
  process.exit(1);
});
