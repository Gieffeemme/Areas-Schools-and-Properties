#!/usr/bin/env node
/**
 * Build src/data/gias.json from GIAS (Get Information About Schools) — the DfE's official register
 * of every school in England. This is the authoritative source of school *pins* (location + phase),
 * replacing OpenStreetMap, which misses schools and mis-classifies phase. Every record carries its
 * DfE URN, which is the join key to all our enrichment data (Ofsted, KS2/KS4/KS5, Parent View,
 * census, destinations) — so switching to GIAS makes that enrichment apply to every school.
 *
 * We keep OPEN establishments whose phase is a real school phase (drop "Not applicable" =
 * children's centres / online providers / etc.), geocode by postcode via postcodes.io (postcode
 * centroid + outcode fallback), and map GIAS phases onto our age-range taxonomy.
 *
 * Source: GIAS bulk "all establishments" CSV (get-information-schools.service.gov.uk/Downloads).
 *   npm run etl:gias
 *   node scripts/etl/build-gias.mjs <csv-url|local.csv>
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "gias.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const BASE = "https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata";
const Q = String.fromCharCode(34);
const ymd = (d) =>
  d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");

function parseLine(l) {
  const out = [];
  let f = "";
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) {
      if (c === Q) { if (l[i + 1] === Q) { f += Q; i++; } else q = false; }
      else f += c;
    } else if (c === Q) q = true;
    else if (c === ",") { out.push(f); f = ""; }
    else f += c;
  }
  out.push(f);
  return out;
}

const cleanPC = (pc) => String(pc ?? "").trim().toUpperCase().replace(/\s+/g, " ");

// GIAS phase -> our age-range taxonomy. "16 plus" splits college vs sixth form by type group.
function mapPhase(phase, group) {
  switch (phase) {
    case "Nursery": return "Nursery";
    case "Primary":
    case "Middle deemed primary": return "Primary";
    case "Secondary":
    case "Middle deemed secondary": return "Secondary";
    case "All-through": return "All-through";
    case "16 plus": return /colleg/i.test(group) ? "College" : "Sixth form";
    default: return undefined; // "Not applicable" etc. -> not a school
  }
}

async function getCsvText() {
  const arg = process.argv[2];
  if (arg && !arg.startsWith("http")) {
    console.log("Reading local CSV:", arg);
    return readFile(arg, "latin1");
  }
  if (arg) {
    return Buffer.from(await (await fetch(arg, { headers: { "User-Agent": UA } })).arrayBuffer()).toString("latin1");
  }
  // GIAS publishes a date-stamped file daily; walk back a few days if today's isn't up yet.
  for (let back = 0; back < 7; back++) {
    const url = `${BASE}${ymd(new Date(Date.now() - back * 86400000))}.csv`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.ok) {
      console.log("Fetching:", url.split("/").pop());
      return Buffer.from(await res.arrayBuffer()).toString("latin1"); // GIAS CSV is Windows-1252
    }
  }
  throw new Error("Could not download a GIAS all-establishments CSV (tried the last 7 days).");
}

/** Geocode postcodes via postcodes.io (bulk, 100 at a time), with outcode-centroid fallback. */
async function geocode(postcodes) {
  const coords = new Map();
  const all = [...postcodes];
  for (let i = 0; i < all.length; i += 100) {
    const batch = all.slice(i, i + 100);
    const res = await fetch("https://api.postcodes.io/postcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcodes: batch }),
    });
    const j = await res.json();
    for (const row of j.result ?? []) {
      if (row.result) coords.set(cleanPC(row.query), { lat: row.result.latitude, lng: row.result.longitude });
    }
    if (i % 2500 === 0) console.log(`  geocoded ${i}/${all.length}…`);
  }
  const missing = all.filter((p) => !coords.has(cleanPC(p)));
  const outcodes = [...new Set(missing.map((p) => cleanPC(p).split(" ")[0]).filter(Boolean))];
  const oc = new Map();
  for (const o of outcodes) {
    try {
      const j = await (await fetch(`https://api.postcodes.io/outcodes/${encodeURIComponent(o)}`)).json();
      if (j.result) oc.set(o, { lat: j.result.latitude, lng: j.result.longitude });
    } catch { /* ignore */ }
  }
  for (const p of missing) {
    const o = cleanPC(p).split(" ")[0];
    if (oc.has(o)) coords.set(cleanPC(p), oc.get(o));
  }
  return coords;
}

async function main() {
  const csv = await getCsvText();
  const lines = csv.split(/\r?\n/);
  const hdr = parseLine(lines[0]);
  const col = (re) => hdr.findIndex((h) => re.test(h));
  const C = {
    urn: col(/^urn$/i),
    name: col(/^establishmentname$/i),
    group: col(/^establishmenttypegroup \(name\)/i),
    status: col(/^establishmentstatus \(name\)/i),
    phase: col(/^phaseofeducation \(name\)/i),
    pc: col(/^postcode$/i),
  };
  if (C.urn < 0 || C.phase < 0 || C.pc < 0) throw new Error("Missing expected GIAS columns (URN/phase/postcode).");

  const recs = [];
  const postcodes = new Set();
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    const x = parseLine(lines[r]);
    const status = (x[C.status] ?? "").trim();
    if (status !== "Open" && status !== "Open, but proposed to close") continue;
    const phase = mapPhase((x[C.phase] ?? "").trim(), (x[C.group] ?? "").trim());
    if (!phase) continue;
    const pc = cleanPC(x[C.pc]);
    if (!pc) continue;
    recs.push({ urn: (x[C.urn] ?? "").trim(), name: (x[C.name] ?? "").trim(), postcode: pc, phase });
    postcodes.add(pc);
  }
  console.log(`Kept ${recs.length} open schools; ${postcodes.size} unique postcodes. Geocoding…`);

  const coords = await geocode(postcodes);
  const out = [];
  let dropped = 0;
  for (const rec of recs) {
    const c = coords.get(rec.postcode);
    if (!c) { dropped++; continue; }
    out.push({ ...rec, lat: Math.round(c.lat * 1e5) / 1e5, lng: Math.round(c.lng * 1e5) / 1e5 });
  }
  await writeFile(OUT, JSON.stringify(out) + "\n");
  const byPhase = {};
  for (const o of out) byPhase[o.phase] = (byPhase[o.phase] || 0) + 1;
  console.log(`Wrote ${out.length} schools → ${OUT}  (${dropped} dropped: un-geocodable)`);
  console.log("by phase:", JSON.stringify(byPhase));
}

main().catch((e) => {
  console.error("GIAS ETL failed:", e.message);
  process.exit(1);
});
