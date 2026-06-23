#!/usr/bin/env node
/**
 * Build src/data/mobile-by-laua.json from Ofcom Connected Nations mobile coverage, aggregated by local
 * authority (LAUA) — the same release and join key as the fixed-broadband ETL (build-broadband.mjs), so
 * this reuses that whole pattern. Keyed by LAUA code (postcodes.io codes.admin_district), UK-wide.
 *
 * Source (Connected Nations 2024 data downloads, "Mobile coverage: UK nations" = LAUA + PCON):
 *   https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/connected-nations-2024/data-downloads-2024
 *
 * The LAUA CSV's columns are {tech}_{prem|geo|…}_{in|out}_{N} where N = number of the four MNOs (EE, O2,
 * Three, Vodafone) covering that location, so _0 = no operator and _4 = all four. We surface the
 * consumer-meaningful premises figures:
 *   4G indoor, ≥1 operator  = 100 − 4G_prem_in_0   (can you get any 4G indoors)
 *   4G indoor, all operators = 4G_prem_in_4         (every network works indoors — matters for switching)
 *   5G outdoor, ≥1 operator = 100 − 5G_high_confidence_prem_out_0  (5G availability; 5G indoor isn't reported)
 *
 * Needs `unzip` on PATH. Usage: npm run etl:mobile  (or pass a local LAUA .csv path)
 */
import { writeFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "mobile-by-laua.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
// 301-redirects to a ?v= URL; Node fetch follows redirects by default.
const ZIP_URL =
  "https://www.ofcom.org.uk/siteassets/resources/documents/research-and-data/multi-sector/infrastructure-research/connected-nations-2024/data-downloads/202409-mobile-coverage_uk-nations-laua-pcon-r01.zip";
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

const num = (v) => {
  const n = parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) ? n : null;
};
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

// A coverage distribution is the five columns {prefix}_0…_4 = % of premises covered by 0,1,2,3,4 of the
// MNOs (summing to ~100). Ofcom leaves a cell BLANK for zero (not the string "0"), so a blank _0 in a
// dense city means 0% have NO coverage → 100% have ≥1 operator. Treat blanks as 0 WITHIN a distribution,
// but return null when the whole distribution is blank (genuinely no data for that row/tech).
function distribution(cells, idxs) {
  const vals = idxs.map((i) => (i >= 0 ? num(cells[i]) : null));
  if (vals.every((v) => v == null)) return null;
  return {
    any: round1(100 - (vals[0] ?? 0)), // ≥1 operator = 100 − (% with none)
    all: round1(vals[4] ?? 0), // all four operators
  };
}

async function main() {
  const arg = process.argv[2];
  const dir = join(tmpdir(), "ofcom-mobile");
  let csv;
  if (arg && arg.endsWith(".csv")) {
    csv = readFileSync(arg, "utf8");
  } else {
    console.log("Downloading Ofcom mobile-coverage LAUA data…");
    const res = await fetch(ZIP_URL, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Ofcom returned ${res.status}`);
    const zipPath = join(tmpdir(), "ofcom-mobile.zip");
    await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
    execSync(`rm -rf ${dir} && unzip -o ${zipPath} -d ${dir}`, { stdio: "ignore" });
    const file = readdirSync(dir).find((f) => /mobile_coverage_laua/i.test(f) && f.endsWith(".csv"));
    if (!file) throw new Error("mobile LAUA coverage CSV not found in the Ofcom zip.");
    console.log("Reading:", file);
    csv = readFileSync(join(dir, file), "utf8");
  }

  const lines = csv.split(/\r?\n/);
  const hdr = parseLine(lines[0]).map((h) => h.trim());
  const idx = (name) => hdr.indexOf(name);
  const distIdx = (prefix) => [0, 1, 2, 3, 4].map((k) => idx(`${prefix}_${k}`));
  const iCode = idx("laua");
  const iName = idx("laua_name");
  const i4gIn = distIdx("4G_prem_in"); // indoor 4G by operator count
  const i5gOut = distIdx("5G_high_confidence_prem_out"); // outdoor 5G (high confidence) by operator count
  if (iCode < 0 || i4gIn[0] < 0 || i5gOut[0] < 0)
    throw new Error("Expected laua + 4G_prem_in_* + 5G_high_confidence_prem_out_* columns.");

  const out = {};
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    const x = parseLine(lines[r]);
    const code = (x[iCode] ?? "").trim();
    if (!code) continue;
    const g4 = distribution(x, i4gIn);
    const g5 = distribution(x, i5gOut);
    out[code] = {
      laName: (x[iName] ?? "").trim(),
      fourGAny: g4 ? g4.any : null, // indoor 4G from ≥1 operator
      fourGAll: g4 ? g4.all : null, // indoor 4G from all four operators
      fiveGAny: g5 ? g5.any : null, // outdoor 5G from ≥1 operator
    };
  }

  const n = Object.keys(out).length;
  if (n < 300) throw new Error(`only ${n} authorities — looks truncated, refusing to write`);
  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${n} local authorities → ${OUT}`);
  for (const code of ["E08000003", "S12000017", "E06000001"]) {
    if (out[code]) console.log("  sample", code, JSON.stringify(out[code]));
  }
}

main().catch((e) => {
  console.error("mobile ETL failed:", e.message);
  process.exit(1);
});
