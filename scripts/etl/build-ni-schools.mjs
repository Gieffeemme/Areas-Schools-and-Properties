#!/usr/bin/env node
/**
 * Build src/data/ni-schools.json from the Department of Education NI "School level" enrolment data
 * (2024/25). NI schools aren't in GIAS, so this is the NI analog of the Welsh register: name, postcode,
 * type→phase, management type, Irish-medium flag and total enrolment per school. Four files (primary,
 * post-primary, special, nursery), each with a "reference data" sheet (address/type) + an "Enrolments"
 * sheet (counts). Geocoded by postcode (postcodes.io). No Ofsted/results enrichment exists for NI (ETI
 * inspects, with no single grade) — schools link to the DE "Schools Plus" institution directory.
 *
 * Source: education-ni.gov.uk "School enrolment - school level data 2024/25" (XLSX), OGL v3.0.
 *   https://www.education-ni.gov.uk/publications/school-enrolment-school-level-data-202425
 *   npm run etl:ni-schools
 * The per-file URLs are date-stamped; when DE republishes, update FILES from the publication page.
 */
import * as XLSX from "xlsx";
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "ni-schools.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const BASE = "https://www.education-ni.gov.uk/sites/default/files";
const FILES = [
  `${BASE}/2025-04/School%20level%20-%20primary%20schools%20-%20SUPPRESSED%202425%20DATA%20REVISED%20APR_0.xlsx`,
  `${BASE}/2025-05/School%20level%20-%20post%20primary%20schools%20-%20SUPPRESSED%202425%20DATA%206%20May.xlsx`,
  `${BASE}/2025-03/School%20level%20-%20special%20schools%20-%20SUPPRESSED%202425%20DATA%20REVISED_2.xlsx`,
  `${BASE}/2025-03/School%20level%20-%20nursery%20schools%20data%20-%20SUPPRESSED%202425%20DATA%20REVISED_1.xlsx`,
];

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const cleanPC = (pc) => norm(pc).toUpperCase();
const titleCase = (s) =>
  norm(s).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase()).replace(/\bps\b/i, "PS");

// DE "school type" → our phase taxonomy + kind + selective (NI grammars select at 11).
function classify(type) {
  const t = norm(type).toUpperCase();
  if (/NURSERY/.test(t)) return { phase: "Nursery" };
  if (/SPECIAL/.test(t)) return { kind: "special" };
  if (/NON.?GRAMMAR/.test(t)) return { phase: "Secondary" }; // before GRAMMAR (substring)
  if (/GRAMMAR/.test(t)) return { phase: "Secondary", selective: true };
  if (/PRIMARY|PREP/.test(t)) return { phase: "Primary" }; // PREP = grammar preparatory dept (primary-age)
  return {};
}

async function loadWorkbook(url) {
  if (!url.startsWith("http")) return XLSX.read(await readFile(url), { type: "buffer" });
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url.split("/").pop()} — DE may have republished; update FILES`);
  return XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
}

const headerRow = (rows, re) => rows.findIndex((r) => Array.isArray(r) && r.some((c) => re.test(norm(c))));
// Sheet names vary in case across the four files ("reference data" vs "Reference data").
const findSheet = (wb, re) => wb.Sheets[wb.SheetNames.find((n) => re.test(n)) ?? ""];

// Map De-ref → total enrolment from the "Enrolments" sheet (last column headed exactly "Total" = the
// grand total). Returns {} if the sheet/columns aren't found, so enrolment is best-effort.
function enrolments(wb) {
  const ws = findSheet(wb, /^enrolments$/i);
  if (!ws) return {};
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  const refRe = /^(DE(NI)? ref|denino)$/i; // "DE ref" / "DENI ref" / "denino" (nursery) across files
  const hi = headerRow(rows, refRe);
  if (hi < 0) return {};
  const h = rows[hi].map(norm);
  const iRef = h.findIndex((c) => refRe.test(c));
  // headline enrolment = the first "Total"/"total pupils" column (the mainstream-class total)
  const iTot = h.findIndex((c) => /^total( pupils)?$/i.test(c));
  if (iTot < 0) return {};
  const out = {};
  for (let r = hi + 1; r < rows.length; r++) {
    const ref = norm(rows[r][iRef]);
    const n = Number(norm(rows[r][iTot]));
    if (/^\d{7}$/.test(ref) && Number.isFinite(n) && n > 0) out[ref] = n;
  }
  return out;
}

function parseFile(wb) {
  const ws = findSheet(wb, /^reference data$/i);
  if (!ws) throw new Error('"reference data" sheet not found');
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
  const hi = headerRow(rows, /^De ref$/i);
  if (hi < 0) throw new Error('"De ref" header not found');
  const h = rows[hi].map(norm);
  const col = (re) => h.findIndex((c) => re.test(c));
  const c = {
    ref: col(/^De ref$/i), name: col(/^school name$/i), pc: col(/^postcode$/i),
    type: col(/^school type$/i), mgmt: col(/^management type$/i), im: col(/^(IM school|Irish Medium)/i),
  };
  if (c.ref < 0 || c.name < 0 || c.pc < 0 || c.type < 0) throw new Error("expected reference columns missing");
  const pupils = enrolments(wb);
  const out = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    const ref = norm(row[c.ref]);
    if (!/^\d{7}$/.test(ref)) continue;
    const { phase, kind, selective } = classify(row[c.type]);
    const rec = {
      ref,
      name: titleCase(row[c.name]).replace(/,.*$/, "").trim(), // DE names carry a trailing ", Town"
      postcode: cleanPC(row[c.pc]),
      management: norm(row[c.mgmt]) || undefined,
      pupils: pupils[ref],
    };
    if (phase) rec.phase = phase;
    if (kind) rec.kind = kind;
    if (selective) rec.selective = true;
    if (c.im >= 0 && /^(yes|y)$/i.test(norm(row[c.im]))) rec.language = "Irish medium";
    if (rec.postcode) out.push(rec);
  }
  return out;
}

/** Geocode postcodes via postcodes.io (bulk, 100 at a time), with outcode-centroid fallback. */
async function geocode(postcodes) {
  const coords = new Map();
  const all = [...postcodes];
  for (let i = 0; i < all.length; i += 100) {
    const res = await fetch("https://api.postcodes.io/postcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcodes: all.slice(i, i + 100) }),
    });
    const j = await res.json();
    for (const row of j.result ?? []) if (row.result) coords.set(cleanPC(row.query), { lat: row.result.latitude, lng: row.result.longitude });
  }
  const missing = all.filter((p) => !coords.has(cleanPC(p)));
  const outcodes = [...new Set(missing.map((p) => cleanPC(p).split(" ")[0]).filter(Boolean))];
  for (const o of outcodes) {
    try {
      const j = await (await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(o)}`)).json();
      if (j.result) for (const p of missing) if (cleanPC(p).split(" ")[0] === o) coords.set(cleanPC(p), { lat: j.result.latitude, lng: j.result.longitude });
    } catch { /* ignore */ }
  }
  return coords;
}

async function main() {
  const args = process.argv.slice(2);
  const sources = args.length ? args : FILES;
  console.log(`Reading ${sources.length} DE school-level files…`);
  const recs = [];
  for (const src of sources) {
    const wb = await loadWorkbook(src);
    const r = parseFile(wb);
    console.log(`  ${src.split("/").pop().slice(0, 40)}… → ${r.length} schools`);
    recs.push(...r);
  }
  if (recs.length < 1000) throw new Error(`only ${recs.length} NI schools — looks truncated, refusing to write`);

  const coords = await geocode(new Set(recs.map((r) => r.postcode)));
  const out = [];
  let dropped = 0;
  for (const r of recs) {
    const ll = coords.get(r.postcode);
    if (!ll) { dropped++; continue; }
    out.push({ ...r, lat: Math.round(ll.lat * 1e5) / 1e5, lng: Math.round(ll.lng * 1e5) / 1e5 });
  }
  await writeFile(OUT, JSON.stringify(out) + "\n");

  const byPhase = {}, byKind = {};
  let im = 0, withPupils = 0;
  for (const o of out) {
    byPhase[o.phase || "(none)"] = (byPhase[o.phase || "(none)"] || 0) + 1;
    byKind[o.kind || "mainstream"] = (byKind[o.kind || "mainstream"] || 0) + 1;
    if (o.language) im++;
    if (o.pupils) withPupils++;
  }
  console.log(`Wrote ${out.length} NI schools → ${OUT}  (${dropped} dropped: no geocode)`);
  console.log("by phase:", JSON.stringify(byPhase), "| by kind:", JSON.stringify(byKind));
  console.log(`Irish-medium: ${im} | with enrolment: ${withPupils}`);
}

main().catch((e) => {
  console.error("NI schools ETL failed:", e.message);
  process.exit(1);
});
