#!/usr/bin/env node
/**
 * Build src/data/scotland-schools.json from the Scottish Government "School Roll and Locations" dataset.
 * Scottish schools aren't in GIAS, so this is the Scotland analog of the Welsh/NI registers — and the
 * richest: one geocoded XLSX with name, postcode, lat/lng, type→phase, pupil roll, denomination and the
 * seed code, for every publicly-funded primary/secondary/special school. No Ofsted/results enrichment
 * exists for Scotland (Education Scotland inspects, with no single grade) — schools link to Parentzone.
 *
 * The download is a zip wrapping the XLSX (needs `unzip` on PATH, like build-broadband/council-tax-cost).
 * Vintage: SG School Roll 2023 (reflects July 2023; updated Feb 2025) — fine for a register.
 *
 * Source: gov.scot / spatialdata.gov.scot "Scottish School Roll and Locations" (XLSX in zip), OGL v3.0.
 *   https://www.data.gov.uk/dataset/9a6f9d86-9698-4a5d-a2c8-89f3b212c52c/scottish-school-roll-and-locations
 *   npm run etl:scotland-schools                # downloads the zip
 *   npm run etl:scotland-schools -- file.xlsx   # parse a local xlsx
 */
import * as XLSX from "xlsx";
import { writeFile, readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "scotland-schools.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const URL = "https://maps.gov.scot/ATOM/shapefiles/SG_SchoolRoll_2023_Table.zip";
const SHEET = "Schools_Final";

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const numOf = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// SchoolType → our phase taxonomy. Scotland has no academic selection, so no grammar/selective.
function classify(type) {
  const t = norm(type);
  if (/^Primary$/i.test(t)) return { phase: "Primary" };
  if (/^Secondary$/i.test(t)) return { phase: "Secondary" };
  if (/^Special$/i.test(t)) return { kind: "special" };
  return {};
}

async function loadWorkbook(arg) {
  if (arg) return XLSX.read(await readFile(arg), { type: "buffer" });
  console.log("Downloading SG School Roll and Locations (gov.scot)…");
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`gov.scot returned ${res.status}`);
  const zipPath = join(tmpdir(), "sg-school-roll.zip");
  await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
  const xlsx = execSync(`unzip -p ${zipPath} "*.xlsx"`, { maxBuffer: 64 * 1024 * 1024 }); // Buffer
  return XLSX.read(xlsx, { type: "buffer" });
}

async function main() {
  const wb = await loadWorkbook(process.argv[2]);
  const sheet = wb.Sheets[SHEET];
  if (!sheet) throw new Error(`sheet "${SHEET}" not found (${wb.SheetNames.join(", ")})`);
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: "" });

  const hdr = rows[0].map(norm);
  const col = (name) => {
    const i = hdr.indexOf(name);
    if (i < 0) throw new Error(`column not found: ${name}`);
    return i;
  };
  const c = {
    seed: col("SeedCode"), name: col("SchoolName"), pc: col("PostCode"), type: col("SchoolType"),
    la: col("LAName"), roll: col("PupilRoll"), den: col("Denomination"),
    lat: col("Latitude"), lng: col("Longitude"),
  };

  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const seed = norm(row[c.seed]);
    const lat = Number(row[c.lat]), lng = Number(row[c.lng]);
    if (!/^\d{6,8}$/.test(seed) || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const { phase, kind } = classify(row[c.type]);
    const den = norm(row[c.den]);
    const rec = {
      seed,
      name: norm(row[c.name]),
      postcode: norm(row[c.pc]).toUpperCase(),
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
      pupils: numOf(row[c.roll]),
      la: norm(row[c.la]) || undefined,
    };
    if (phase) rec.phase = phase;
    if (kind) rec.kind = kind;
    if (den && !/^non-denominational$/i.test(den)) rec.religion = den;
    out.push(rec);
  }
  if (out.length < 2000) throw new Error(`only ${out.length} Scottish schools — looks truncated, refusing to write`);

  await writeFile(OUT, JSON.stringify(out) + "\n");
  const byPhase = {}, byKind = {};
  let roll = 0, faith = 0;
  for (const o of out) {
    byPhase[o.phase || "(none)"] = (byPhase[o.phase || "(none)"] || 0) + 1;
    byKind[o.kind || "mainstream"] = (byKind[o.kind || "mainstream"] || 0) + 1;
    if (o.pupils) roll++;
    if (o.religion) faith++;
  }
  console.log(`Wrote ${out.length} Scottish schools → ${OUT}`);
  console.log("by phase:", JSON.stringify(byPhase), "| by kind:", JSON.stringify(byKind));
  console.log(`with roll: ${roll} | faith: ${faith}`);
}

main().catch((e) => {
  console.error("Scotland schools ETL failed:", e.message);
  process.exit(1);
});
