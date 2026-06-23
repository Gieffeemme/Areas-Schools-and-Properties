#!/usr/bin/env node
/**
 * Build src/data/council-tax-cost-by-laua.json from MHCLG's "Council Tax levels set by local
 * authorities in England" - the ACTUAL annual council tax (£) for every band (A-H), per billing
 * authority, all-in (the area total: district + county + police + fire + average parish precept).
 * Keyed by ONS authority code, which we already get per postcode (codes.admin_district). Turns the
 * property report's "Band D" into "Band D - ~£X/yr".
 *
 * Source: the "Tables 1-9" ODS on the annual release page. Table_9 is the per-authority, per-band
 * area total. England only (Wales sets its own). The project's `xlsx` can't read this ODS (it has
 * "error" cells), so we parse the ODS content.xml directly (it's a zip of XML).
 *   https://www.gov.uk/government/statistics/council-tax-levels-set-by-local-authorities-in-england-<years>
 *
 * Needs `unzip` on PATH. Usage:
 *   npm run etl:council-tax-cost                 # latest release this script knows about (2026-27)
 *   npm run etl:council-tax-cost -- file.ods     # a local Tables_1-9 ODS
 */
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "council-tax-cost-by-laua.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const YEAR = "2026-27";
const RELEASE = "https://www.gov.uk/government/statistics/council-tax-levels-set-by-local-authorities-in-england-2026-to-2027";

const BANDS = ["A", "B", "C", "D", "E", "F", "G", "H"];

// One named <table:table> block from an ODS content.xml.
function tableBlock(xml, name) {
  const at = xml.indexOf(`table:name="${name}"`);
  if (at < 0) return "";
  return xml.slice(xml.lastIndexOf("<table:table ", at), xml.indexOf("</table:table>", at));
}

// Parse ODS rows -> string cells, expanding number-columns-repeated and reading office:value.
function parseRows(block) {
  const rows = [];
  for (const rm of block.matchAll(/<table:table-row[^>]*>([\s\S]*?)<\/table:table-row>/g)) {
    const cells = [];
    const rx =
      /<table:(?:covered-table-cell|table-cell)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-table-cell|table-cell)>)/g;
    let m;
    while ((m = rx.exec(rm[1]))) {
      const attrs = m[1] || "";
      const rep = Math.min(parseInt(attrs.match(/number-columns-repeated="(\d+)"/)?.[1] ?? "1", 10), 80);
      const val = attrs.match(/office:value="([^"]*)"/)?.[1];
      const text = (m[2] || "").replace(/<[^>]+>/g, "").trim();
      const cell = (val ?? text ?? "").trim();
      for (let i = 0; i < rep; i++) cells.push(cell);
    }
    rows.push(cells);
  }
  return rows;
}

async function loadOds(arg) {
  if (arg && arg.endsWith(".ods")) return arg;
  console.log(`Finding the Tables 1-9 ODS on the ${YEAR} release page…`);
  const page = await fetch(RELEASE, { headers: { "User-Agent": UA } });
  if (!page.ok) throw new Error(`release page returned ${page.status}`);
  const url = (await page.text()).match(/https:\/\/[^"']*Tables_1-9[^"']*\.ods/)?.[0];
  if (!url) throw new Error("Tables_1-9 ODS link not found on the release page");
  console.log("Downloading", url);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const odsPath = join(tmpdir(), "ct-levels.ods");
  await writeFile(odsPath, Buffer.from(await res.arrayBuffer()));
  return odsPath;
}

async function main() {
  const odsPath = await loadOds(process.argv[2]);
  const dir = join(tmpdir(), "ct-levels-x");
  execSync(`rm -rf ${dir} && unzip -o ${odsPath} content.xml -d ${dir}`, { stdio: "ignore" });
  const xml = readFileSync(join(dir, "content.xml"), "utf8");

  const rows = parseRows(tableBlock(xml, "Table_9"));
  const hdr = rows.find((r) => r[0] === "E Code" && r.includes("ONS Code"));
  if (!hdr) throw new Error("Table_9 band header not found");
  const iOns = hdr.indexOf("ONS Code");
  const iBand = Object.fromEntries(BANDS.map((b) => [b, hdr.indexOf(`Band ${b}`)]));
  if (Object.values(iBand).some((i) => i < 0)) throw new Error("a Band A-H column is missing");

  const out = {};
  for (const r of rows) {
    const ons = r[iOns];
    if (!/^E\d{8}$/.test(ons || "")) continue; // England billing authorities
    const bands = {};
    for (const b of BANDS) {
      const n = parseFloat((r[iBand[b]] || "").replace(/[, ]/g, ""));
      if (Number.isFinite(n) && n > 0) bands[b] = Math.round(n);
    }
    if (Object.keys(bands).length) out[ons] = bands;
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${Object.keys(out).length} authorities (${YEAR} area Band A-H totals) → ${OUT}`);
  for (const code of ["E09000011", "E07000223", "E08000003"]) {
    if (out[code]) console.log("  sample", code, "Band D £" + out[code].D);
  }
}

main().catch((e) => {
  console.error("council-tax-cost ETL failed:", e.message);
  process.exit(1);
});
