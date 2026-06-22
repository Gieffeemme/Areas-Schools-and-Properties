#!/usr/bin/env node
/**
 * Build src/data/finance-by-urn.json from DfE school finance (Financial Benchmarking & Insights
 * Tool), keyed by URN: total expenditure per pupil, revenue reserve and in-year balance. Combines
 * the two reporting regimes — maintained schools (CFR workbook) and academies (AAR workbook) —
 * both of which publish pre-computed totals, so we just read them and divide by pupils.
 *
 * Source: financial-benchmarking-and-insights-tool.education.gov.uk/files/*.xlsx (browser UA).
 *   npm run etl:finance
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as XLSX from "xlsx";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "finance-by-urn.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const BASE = "https://financial-benchmarking-and-insights-tool.education.gov.uk/files";
const YEAR = "2024-25";
const YEAR_LABEL = "2024/25";

const num = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").trim().replace(/[£,]/g, "");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

async function fetchWb(name) {
  const res = await fetch(`${BASE}/${name}`, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
  return XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
}

// Read a sheet into data rows + a column-index map resolved by header regex (header on `headerRow`).
function readSheet(wb, sheet, headerRow, cols) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, blankrows: false });
  const hdr = rows[headerRow] || [];
  const idx = {};
  for (const [k, re] of Object.entries(cols)) {
    idx[k] = hdr.findIndex((c) => re.test(String(c ?? "").trim()));
    if (idx[k] < 0) throw new Error(`${sheet}: column ${k} not found`);
  }
  return { rows: rows.slice(headerRow + 1), idx };
}

async function main() {
  console.log("Fetching school finance workbooks (CFR + AAR) from FBIT…");
  const [cfrWb, aarWb] = await Promise.all([
    fetchWb(`CFR_${YEAR}_Full_Data_Workbook.xlsx`),
    fetchWb(`AAR_${YEAR}_download.xlsx`),
  ]);

  const out = {};
  const put = (urn, pupils, exp, reserve, inYear) => {
    if (!/^\d+$/.test(urn)) return false;
    const perPupil = exp != null && pupils > 0 ? Math.round(exp / pupils) : null;
    if (perPupil == null && reserve == null && inYear == null) return false;
    out[urn] = { perPupil, reserve, inYear, year: YEAR_LABEL };
    return true;
  };

  // Maintained schools (CFR).
  const cfr = readSheet(cfrWb, "CFR Data", 0, {
    urn: /^URN$/i,
    pupils: /^No pupils$/i,
    exp: /^Total Expenditure/i,
    reserve: /^Revenue Reserve/i,
    inYear: /^In-?year Balance/i,
  });
  let cfrN = 0;
  for (const r of cfr.rows) {
    if (put(String(r[cfr.idx.urn] ?? "").trim(), num(r[cfr.idx.pupils]), num(r[cfr.idx.exp]), num(r[cfr.idx.reserve]), num(r[cfr.idx.inYear]))) cfrN++;
  }

  // Academies (AAR) — a URN can appear on multiple trust rows; keep the largest-expenditure one.
  const aar = readSheet(aarWb, "Academies", 1, {
    urn: /^URN$/i,
    pupils: /^Number of pupils in academy/i,
    exp: /^Total Expenditure$/i,
    reserve: /^Revenue Reserve$/i,
    inYear: /^In year balance$/i,
  });
  const best = {};
  for (const r of aar.rows) {
    const urn = String(r[aar.idx.urn] ?? "").trim();
    if (!/^\d+$/.test(urn)) continue;
    const exp = num(r[aar.idx.exp]);
    if (best[urn] && (best[urn].exp ?? -Infinity) >= (exp ?? -Infinity)) continue;
    best[urn] = { pupils: num(r[aar.idx.pupils]), exp, reserve: num(r[aar.idx.reserve]), inYear: num(r[aar.idx.inYear]) };
  }
  let aarN = 0;
  for (const [urn, v] of Object.entries(best)) {
    if (put(urn, v.pupils, v.exp, v.reserve, v.inYear)) aarN++; // academies override any stale CFR row
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`CFR maintained: ${cfrN} · AAR academies: ${aarN}`);
  console.log(`Wrote ${Object.keys(out).length} finance records (${YEAR_LABEL}) → ${OUT}`);
}

main().catch((e) => {
  console.error("finance ETL failed:", e.message);
  process.exit(1);
});
