#!/usr/bin/env node
/**
 * Build src/data/welsh-schools.json from the Welsh Government "Address list of schools in Wales" (ODS).
 * Welsh schools are in GIAS but carry phase "Not applicable" and no statutory age range (0.4% have one),
 * so they can't be placed by GIAS and build-gias.mjs excludes them. This register is the Welsh analog:
 * it gives every maintained, independent and PRU school's sector (-> phase), pupils, Welsh-medium
 * language category, religious character, LA and postcode. Geocoded by postcode (postcodes.io), like
 * GIAS's no-grid-ref fallback. No Ofsted/results enrichment exists for Wales (that needs Estyn — a
 * separate pipeline); these are school *pins* with basic facts + a My Local School link.
 *
 * Source: gov.wales "Address list of schools" (ODS), Welsh Government, OGL v3.0.
 *   https://www.gov.wales/address-list-schools
 *   npm run etl:welsh-schools                # downloads the ODS
 *   npm run etl:welsh-schools -- file.ods    # parse a local file
 */
import * as XLSX from "xlsx";
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "welsh-schools.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const URL =
  "https://www.gov.wales/sites/default/files/publications/2026-04/address-list-schools-values.ods";

// Welsh "Sector" -> our phase taxonomy. Welsh "Middle" schools are 3-16/3-19 (primary + secondary in
// one), i.e. all-through. Special has no clean phase — placed by kind, phase left undefined.
const SECTOR_PHASE = { Primary: "Primary", Secondary: "Secondary", Nursery: "Nursery", Middle: "All-through" };

const norm = (v) => String(v ?? "").replace(/\s+/g, " ").trim();
const cleanPC = (pc) => norm(pc).toUpperCase();
const numOf = (v) => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : undefined;
};

// "English medium school / provision" -> "English medium"; drop "Not applicable".
function language(v) {
  const s = norm(v);
  if (/welsh medium/i.test(s)) return "Welsh medium";
  if (/dual language/i.test(s)) return "Dual language";
  if (/english medium/i.test(s)) return "English medium";
  return undefined;
}
// keep real faith characters; drop placeholders ("---", "Not available", "Not applicable")
function religion(v) {
  const s = norm(v);
  return s && !/^(-+|not available|not applicable|none|does not apply)$/i.test(s) ? s : undefined;
}
// Age range out of a School Type like "Secondary (ages 11-19)" / "Middle (ages 3-16)".
function ages(v) {
  const m = norm(v).match(/ages?\s*(\d{1,2})\s*[-–]\s*(\d{1,2})/i);
  if (!m) return {};
  const lo = Number(m[1]), hi = Number(m[2]);
  return lo > 0 && hi >= lo ? { ageLow: lo, ageHigh: hi } : {};
}

async function loadWorkbook(arg) {
  if (arg) return XLSX.read(readFileSync(arg), { type: "buffer" });
  console.log("Downloading Welsh Government address list of schools…");
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`gov.wales returned ${res.status}`);
  return XLSX.read(Buffer.from(await res.arrayBuffer()), { type: "buffer" });
}

function rowsOf(wb, name) {
  const ws = wb.Sheets[name];
  if (!ws) throw new Error(`sheet "${name}" not found (${wb.SheetNames.join(", ")})`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false, defval: "" });
}
const headerIdx = (rows) => rows.findIndex((r) => Array.isArray(r) && /^school number$/i.test(norm(r[0])));
function columns(rows, hi) {
  const h = rows[hi].map(norm);
  const find = (re) => h.findIndex((c) => re.test(c));
  return { find };
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
    for (const row of j.result ?? []) {
      if (row.result) coords.set(cleanPC(row.query), { lat: row.result.latitude, lng: row.result.longitude });
    }
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

function parseMaintained(rows) {
  const hi = headerIdx(rows);
  if (hi < 0) throw new Error("Maintained: 'School Number' header not found");
  const { find } = columns(rows, hi);
  const c = {
    num: 0, name: 1, la: find(/^local authority$/i), sector: find(/^sector$/i),
    lang: find(/^school language/i), type: find(/^school type$/i), rel: find(/^religious/i),
    pc: find(/^postcode$/i), pupils: find(/^pupils/i),
  };
  const out = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const x = rows[r];
    const num = norm(x[c.num]);
    if (!/^\d{7}$/.test(num)) continue;
    const sector = norm(x[c.sector]);
    const rec = {
      number: num, name: norm(x[c.name]), postcode: cleanPC(x[c.pc]),
      la: norm(x[c.la]) || undefined, pupils: numOf(x[c.pupils]),
      language: language(x[c.lang]), religion: religion(x[c.rel]), ...ages(x[c.type]),
    };
    if (sector === "Special") rec.kind = "special";
    else rec.phase = SECTOR_PHASE[sector]; // undefined for unknown sectors
    if (rec.postcode) out.push(rec);
  }
  return out;
}

// Independent + PRU sheets share a shape (no sector column). kind is fixed per sheet.
function parseSimple(rows, kind) {
  const hi = headerIdx(rows);
  if (hi < 0) throw new Error(`${kind}: 'School Number' header not found`);
  const { find } = columns(rows, hi);
  const c = { num: 0, name: 1, la: find(/^local authority$/i), pc: find(/^postcode$/i) };
  const out = [];
  for (let r = hi + 1; r < rows.length; r++) {
    const x = rows[r];
    const num = norm(x[c.num]);
    if (!/^\d{7}$/.test(num)) continue;
    const postcode = cleanPC(x[c.pc]);
    if (postcode) out.push({ number: num, name: norm(x[c.name]), postcode, la: norm(x[c.la]) || undefined, kind });
  }
  return out;
}

async function main() {
  const wb = await loadWorkbook(process.argv[2]);
  const recs = [
    ...parseMaintained(rowsOf(wb, "Maintained")),
    ...parseSimple(rowsOf(wb, "Independent"), "independent"),
    ...parseSimple(rowsOf(wb, "PRU"), "alternative"),
  ];
  if (recs.length < 1400) throw new Error(`only ${recs.length} Welsh schools — looks truncated, refusing to write`);

  const coords = await geocode(new Set(recs.map((r) => r.postcode)));
  const out = [];
  let dropped = 0;
  for (const r of recs) {
    const c = coords.get(r.postcode);
    if (!c) { dropped++; continue; }
    out.push({ ...r, lat: Math.round(c.lat * 1e5) / 1e5, lng: Math.round(c.lng * 1e5) / 1e5 });
  }
  await writeFile(OUT, JSON.stringify(out) + "\n");

  const byPhase = {}, byKind = {}, byLang = {};
  for (const o of out) {
    byPhase[o.phase || "(none)"] = (byPhase[o.phase || "(none)"] || 0) + 1;
    byKind[o.kind || "mainstream"] = (byKind[o.kind || "mainstream"] || 0) + 1;
    if (o.language) byLang[o.language] = (byLang[o.language] || 0) + 1;
  }
  console.log(`Wrote ${out.length} Welsh schools → ${OUT}  (${dropped} dropped: no geocode)`);
  console.log("by phase:", JSON.stringify(byPhase));
  console.log("by kind:", JSON.stringify(byKind));
  console.log("by language:", JSON.stringify(byLang));
}

main().catch((e) => {
  console.error("Welsh schools ETL failed:", e.message);
  process.exit(1);
});
