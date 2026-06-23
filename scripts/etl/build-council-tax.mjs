#!/usr/bin/env node
/**
 * Build src/data/council-tax-bands-by-lsoa.json from the VOA's "Council Tax: stock of properties"
 * statistics — table CTSOP4.1, which gives the count of dwellings by Council Tax band down to LSOA.
 * Keyed by LSOA 2011 code (the same join key the app already gets per postcode from postcodes.io,
 * codes.lsoa), so the app can show the band mix of a neighbourhood with no per-property scrape.
 *
 * Output per LSOA: { bands: { A: n, … H/I: n }, total }. Counts are VOA-rounded to the nearest 10;
 * bands with a nil/negligible value ("-") are omitted. England has bands A–H, Wales A–I.
 *
 * Source (annual snapshot, 31 March): the release page lists CTSOP4.1.zip as a media asset.
 *   https://www.gov.uk/government/statistics/council-tax-stock-of-properties-<year>
 *
 * Needs `unzip` on PATH (macOS/Linux have it).
 *   npm run etl:council-tax              # downloads the latest release this script knows about (2025)
 *   npm run etl:council-tax -- 2025      # a specific release year
 *   npm run etl:council-tax -- file.csv  # a local CTSOP4.1 CSV (skips the download)
 *   npm run etl:council-tax -- file.zip  # a local CTSOP4.1 zip
 */
import { writeFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "council-tax-bands-by-lsoa.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const DEFAULT_YEAR = "2025";
const releasePage = (year) =>
  `https://www.gov.uk/government/statistics/council-tax-stock-of-properties-${year}`;
const Q = String.fromCharCode(34);

function parseLine(l) {
  const out = [];
  let f = "";
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) {
      if (c === Q) {
        if (l[i + 1] === Q) { f += Q; i++; } else q = false;
      } else f += c;
    } else if (c === Q) q = true;
    else if (c === ",") { out.push(f); f = ""; }
    else f += c;
  }
  out.push(f);
  return out;
}

// VOA counts are integers rounded to 10; "-" marks a nil/negligible cell.
const num = (v) => {
  const s = String(v ?? "").trim();
  if (!s || s === "-") return 0;
  const n = parseInt(s.replace(/,/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

// Resolve the CTSOP4.1 CSV text from a local file, a local zip, or the gov.uk release page.
async function loadCsv(arg) {
  if (arg && arg.endsWith(".csv")) return readFileSync(arg, "utf8");

  const dir = join(tmpdir(), "voa-ctsop");
  if (arg && arg.endsWith(".zip")) {
    execSync(`rm -rf ${dir} && unzip -o ${arg} -d ${dir}`, { stdio: "ignore" });
    return readExtractedCsv(dir);
  }

  const year = /^\d{4}$/.test(arg ?? "") ? arg : DEFAULT_YEAR;
  console.log(`Finding CTSOP4.1 on the ${year} release page…`);
  const page = await fetch(releasePage(year), { headers: { "User-Agent": UA } });
  if (!page.ok) throw new Error(`release page ${year} returned ${page.status}`);
  const html = await page.text();
  const zipUrl = html.match(/https:\/\/[^"']*CTSOP4\.1\.zip/)?.[0];
  if (!zipUrl) throw new Error(`CTSOP4.1.zip link not found on the ${year} release page`);

  console.log("Downloading", zipUrl);
  const res = await fetch(zipUrl, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const zipPath = join(tmpdir(), "voa-ctsop.zip");
  await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
  execSync(`rm -rf ${dir} && unzip -o ${zipPath} -d ${dir}`, { stdio: "ignore" });
  return readExtractedCsv(dir);
}

// The zip extracts into a CTSOP4.1/ subfolder holding CTSOP4_1_<date>.csv (+ a notes .xlsx).
function readExtractedCsv(dir) {
  const find = (d) => {
    for (const name of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, name.name);
      if (name.isDirectory()) {
        const hit = find(p);
        if (hit) return hit;
      } else if (/CTSOP4_1.*\.csv$/i.test(name.name)) return p;
    }
    return null;
  };
  const csv = find(dir);
  if (!csv) throw new Error("CTSOP4.1 CSV not found in the unzipped folder.");
  console.log("Reading:", csv);
  return readFileSync(csv, "utf8");
}

async function main() {
  const csv = await loadCsv(process.argv[2]);
  const lines = csv.replace(/^﻿/, "").split(/\r?\n/);

  const h = parseLine(lines[0]).map((c) => c.trim().toLowerCase());
  const iGeo = h.indexOf("geography");
  const iCode = h.indexOf("ecode");
  const iBand = h.indexOf("band");
  const iAll = h.indexOf("all_properties");
  if (iGeo < 0 || iCode < 0 || iBand < 0 || iAll < 0)
    throw new Error("Expected geography / ecode / band / all_properties columns.");

  // Accumulate band counts per LSOA. Only the LSOA-level rows; the "All" band row is the total and is
  // recomputed from the per-band rows so the displayed split is internally consistent.
  const out = {};
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    const x = parseLine(lines[r]);
    if (x[iGeo] !== "LSOA") continue;
    const code = (x[iCode] ?? "").trim();
    if (!/^[EW]01\d{6}$/.test(code)) continue;
    const band = (x[iBand] ?? "").trim().toUpperCase();
    if (!/^[A-I]$/.test(band)) continue; // skip the "All" summary row
    const n = num(x[iAll]);
    if (!n) continue;
    (out[code] ??= { bands: {} }).bands[band] = n;
  }

  // Finalise: total per LSOA; drop LSOAs that ended up with no banded dwellings.
  let kept = 0;
  for (const code of Object.keys(out)) {
    const bands = out[code].bands;
    const total = Object.values(bands).reduce((a, b) => a + b, 0);
    if (!total) { delete out[code]; continue; }
    out[code].total = total;
    kept++;
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${kept} LSOA council-tax band records → ${OUT}`);
  const sample = Object.entries(out)[0];
  if (sample) console.log("Sample:", sample[0], JSON.stringify(sample[1]));
}

main().catch((e) => {
  console.error("council-tax ETL failed:", e.message);
  process.exit(1);
});
