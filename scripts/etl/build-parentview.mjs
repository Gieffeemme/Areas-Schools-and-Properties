#!/usr/bin/env node
/**
 * Build src/data/parentview-by-urn.json from Ofsted's "Parent View: management information"
 * (xlsx), keyed by URN. We capture the full survey: every question's % positive (and % negative)
 * so the UI can show the whole parent-satisfaction breakdown, not just the headline.
 *
 * The "School Level Data" sheet stores each answer as a proportion of submissions (cols sum ~1).
 * Ofsted's own framing (Table 1, note 3): Positive = Strongly Agree + Agree; Negative =
 * Strongly Disagree + Disagree; "Don't Know" is neither.
 *
 * Question shapes (verified against the workbook, not assumed):
 *   - Standard agreement (5 options): Q1-3, Q5, Q8-13, and Q7b.
 *   - Agreement + "Not Applicable": Q4 (NA = "child has not been bullied") and Q6
 *     (NA = "have not raised concerns"). We compute % positive *among the applicable population*
 *     (excluding NA) — including NA would bury the real figure — and report the NA share separately.
 *   - Q7a: Yes/No SEND prevalence gate ("does your child have SEND?"). Q7b is suppressed (<10 SEND
 *     responses), so it can be absent even when the school is present.
 *   - Q14: Yes/No "would recommend".
 *
 * Each URN: { happy, responses, q } where `happy` (= Q1 positive %) and `responses` are kept for
 * backward-compatibility with SchoolCard's pill. `q` is keyed by question id ("1".."14","7a","7b"):
 *   agreement      -> { pos, neg }
 *   agreement + NA -> { pos, neg, na }   (pos/neg over applicable base; na over all responders)
 *   Q7a            -> { yes }            (% reporting SEND)
 *   Q14            -> { pos }            (% who would recommend; neg implied = 100 - pos)
 * Suppressed/empty questions are omitted from `q`.
 *
 * Source: https://www.gov.uk/government/statistical-data-sets/ofsted-parent-view-management-information
 *
 * Usage:
 *   npm run etl:parentview                          # latest file from gov.uk
 *   node scripts/etl/build-parentview.mjs <url>
 *   node scripts/etl/build-parentview.mjs ./file.xlsx
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as XLSX from "xlsx";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "parentview-by-urn.json");
const PAGE =
  "https://www.gov.uk/government/statistical-data-sets/ofsted-parent-view-management-information";
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function fileTimestamp(u) {
  const f = decodeURIComponent(u);
  const m = f.match(/as_at_(\d{1,2})_([A-Za-z]+)_(\d{4})/);
  return m ? Date.UTC(+m[3], (MONTHS[m[2].toLowerCase()] || 1) - 1, +m[1]) : 0;
}

async function getWorkbook() {
  const arg = process.argv[2];
  if (arg && !arg.startsWith("http")) {
    console.log("Reading local file:", arg);
    return { wb: XLSX.read(await readFile(arg), { type: "buffer" }), label: arg };
  }
  let url = arg;
  if (!url) {
    const page = await (await fetch(PAGE)).text();
    const urls = [
      ...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"]+\.xlsx/g),
    ].map((m) => m[0]);
    url = urls.sort((a, b) => fileTimestamp(b) - fileTimestamp(a))[0];
    if (!url) throw new Error("No Parent View MI .xlsx link found on gov.uk.");
  }
  const label = decodeURIComponent(url.split("/").pop());
  console.log("Fetching:", label);
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  return { wb: XLSX.read(buf, { type: "buffer" }), label };
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Header names vary in punctuation across file versions ("Don't Know" vs "Q7b Dont Know").
// Match on a normalised key: lowercased, apostrophes stripped, whitespace collapsed.
const normalize = (s) => String(s).toLowerCase().replace(/[''`]/g, "").replace(/\s+/g, " ").trim();

const pctOf = (n, base) => Math.round((n / base) * 100);

async function main() {
  const { wb, label } = await getWorkbook();
  const sheet =
    wb.Sheets["School Level Data"] ||
    wb.Sheets[wb.SheetNames.find((n) => /school level/i.test(n)) ?? ""];
  if (!sheet) throw new Error("No 'School Level Data' sheet in the workbook.");

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
  const hi = rows.findIndex((r) => String(r[0]).trim().toLowerCase() === "urn");
  if (hi < 0) throw new Error("Could not find the URN header row.");

  // Map normalised header -> column index, so we can look up each answer by name.
  const idx = new Map();
  rows[hi].forEach((h, i) => idx.set(normalize(h), i));
  const iSub = idx.get("submissions");
  if (idx.get("q1 strongly agree") == null)
    throw new Error("Could not find the 'Q1 Strongly Agree' column — sheet layout changed.");

  // Per-row reader: answer proportion (0..1) by header name; 0 if the column is absent/blank.
  const reader = (row) => (name) => {
    const i = idx.get(normalize(name));
    return i == null ? 0 : num(row[i]);
  };

  // Standard 5-option agreement question -> { pos, neg } or null if no responses.
  const agree = (get, q) => {
    const sa = get(`q${q} strongly agree`), a = get(`q${q} agree`);
    const d = get(`q${q} disagree`), sd = get(`q${q} strongly disagree`), dk = get(`q${q} dont know`);
    const base = sa + a + d + sd + dk;
    return base > 0 ? { pos: pctOf(sa + a, base), neg: pctOf(sd + d, base) } : null;
  };

  // Agreement + "Not Applicable" (Q4, Q6): pos/neg measured among the applicable population
  // (those for whom the question applied), na as a share of everyone who responded.
  const agreeNA = (get, q) => {
    const sa = get(`q${q} strongly agree`), a = get(`q${q} agree`);
    const d = get(`q${q} disagree`), sd = get(`q${q} strongly disagree`), dk = get(`q${q} dont know`);
    const na = get(`q${q} not applicable`);
    const app = sa + a + d + sd + dk;
    const total = app + na;
    if (total <= 0) return null;
    const rec = { na: pctOf(na, total) };
    if (app > 0) {
      rec.pos = pctOf(sa + a, app);
      rec.neg = pctOf(sd + d, app);
    }
    return rec;
  };

  // Yes/No question -> % answering Yes, or null if no responses.
  const yesShare = (get, q) => {
    const y = get(`q${q} yes`), n = get(`q${q} no`);
    const base = y + n;
    return base > 0 ? pctOf(y, base) : null;
  };

  const out = {};
  let withFull = 0;
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    const urn = String(row[0] ?? "").trim();
    if (!/^\d+$/.test(urn)) continue;
    const get = reader(row);

    const q1 = agree(get, "1");
    if (!q1) continue; // no Q1 responses -> school carries no usable Parent View data

    const q = { 1: q1 };
    for (const id of ["2", "3"]) { const v = agree(get, id); if (v) q[id] = v; }
    { const v = agreeNA(get, "4"); if (v) q["4"] = v; }
    { const v = agree(get, "5"); if (v) q["5"] = v; }
    { const v = agreeNA(get, "6"); if (v) q["6"] = v; }
    { const y = yesShare(get, "7a"); if (y != null) q["7a"] = { yes: y }; }
    { const v = agree(get, "7b"); if (v) q["7b"] = v; }
    for (const id of ["8", "9", "10", "11", "12", "13"]) { const v = agree(get, id); if (v) q[id] = v; }
    { const y = yesShare(get, "14"); if (y != null) q["14"] = { pos: y }; }

    if (Object.keys(q).length > 1) withFull++;
    out[urn] = {
      happy: q1.pos,
      responses: iSub != null ? num(row[iSub]) : undefined,
      q,
    };
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  const n = Object.keys(out).length;
  console.log(`Wrote ${n} Parent View records (${withFull} with full breakdown) — ${label} → ${OUT}`);
}

main().catch((e) => {
  console.error("Parent View ETL failed:", e.message);
  process.exit(1);
});
