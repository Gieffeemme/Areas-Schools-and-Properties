#!/usr/bin/env node
/**
 * Build src/data/broadband-by-laua.json from Ofcom Connected Nations fixed-broadband coverage,
 * aggregated by local authority (LAUA). One small open file (Open Government Licence), keyed by the
 * LAUA code — which we already get per postcode from postcodes.io (codes.admin_district), so the app
 * joins broadband to an area with no per-postcode dataset.
 *
 * Source (Connected Nations 2024 data downloads, "Fixed coverage: UK nations" = LAUA + PCON):
 *   https://www.ofcom.org.uk/phones-and-broadband/coverage-and-speeds/connected-nations-2024/data-downloads-2024
 *
 * Needs `unzip` on PATH (macOS/Linux have it). Usage: npm run etl:broadband
 */
import { writeFile } from "node:fs/promises";
import { readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "broadband-by-laua.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const ZIP_URL =
  "https://www.ofcom.org.uk/siteassets/resources/documents/research-and-data/multi-sector/infrastructure-research/connected-nations-2024/data-downloads/202407-fixed-coverage-uk-nations-laua-pcon-r01.zip";
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

const pct = (v) => {
  const n = parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
};

async function main() {
  const arg = process.argv[2];
  const dir = join(tmpdir(), "ofcom-broadband");
  let csv;
  if (arg && arg.endsWith(".csv")) {
    csv = readFileSync(arg, "utf8");
  } else {
    console.log("Downloading Ofcom fixed-coverage LAUA data…");
    const res = await fetch(ZIP_URL, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Ofcom returned ${res.status}`);
    const zipPath = join(tmpdir(), "ofcom-broadband.zip");
    await writeFile(zipPath, Buffer.from(await res.arrayBuffer()));
    execSync(`rm -rf ${dir} && unzip -o ${zipPath} -d ${dir}`, { stdio: "ignore" });
    const file = readdirSync(dir).find((f) => /laua_coverage/i.test(f) && !/_res_/i.test(f) && f.endsWith(".csv"));
    if (!file) throw new Error("LAUA coverage CSV not found in the Ofcom zip.");
    console.log("Reading:", file);
    csv = readFileSync(join(dir, file), "utf8");
  }

  const lines = csv.split(/\r?\n/);
  const hdr = parseLine(lines[0]).map((h) => h.trim());
  const col = (test) => hdr.findIndex((h) => test(h));
  const iCode = col((h) => h.toLowerCase() === "laua");
  const iName = col((h) => h.toLowerCase() === "laua_name");
  const iSf = col((h) => h.includes("SFBB availability"));
  const iUf = col((h) => h.includes("UFBB availability (% premises)"));
  const iFf = col((h) => h.includes("Full Fibre availability"));
  const iGig = col((h) => h.includes("Gigabit availability"));
  const iUso = col((h) => h.includes("% of premises below the USO"));
  if (iCode < 0 || iSf < 0) throw new Error("Expected 'laua' + 'SFBB availability' columns.");

  const out = {};
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    const x = parseLine(lines[r]);
    const code = (x[iCode] ?? "").trim();
    if (!code) continue;
    out[code] = {
      laName: (x[iName] ?? "").trim(),
      superfast: pct(x[iSf]),
      ultrafast: iUf >= 0 ? pct(x[iUf]) : null,
      fullFibre: iFf >= 0 ? pct(x[iFf]) : null,
      gigabit: iGig >= 0 ? pct(x[iGig]) : null,
      belowUso: iUso >= 0 ? pct(x[iUso]) : null,
    };
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  const n = Object.keys(out).length;
  console.log(`Wrote ${n} local authorities → ${OUT}`);
  const sample = Object.entries(out)[0];
  if (sample) console.log("Sample:", sample[0], JSON.stringify(sample[1]));
}

main().catch((e) => {
  console.error("broadband ETL failed:", e.message);
  process.exit(1);
});
