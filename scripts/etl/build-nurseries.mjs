#!/usr/bin/env node
/**
 * Build src/data/nurseries.json from Ofsted's "Childcare providers and inspections" management
 * information (the Early Years register) — the authoritative, comprehensive source of nurseries
 * in England, which OpenStreetMap misses. Each record carries the Ofsted inspection outcome.
 *
 * We keep ACTIVE, non-domestic, Early-Years-registered settings (nurseries / pre-schools) and drop
 * childminders (domestic premises — home addresses are withheld and would clutter the map). The
 * register gives a postcode, not coordinates, so we geocode via postcodes.io (postcode centroid,
 * with an outcode-centroid fallback for terminated/invalid postcodes so nothing is dropped).
 *
 * Source: https://www.gov.uk/government/statistical-data-sets/childcare-providers-and-inspections-management-information
 *
 * Usage:
 *   npm run etl:nurseries
 *   node scripts/etl/build-nurseries.mjs <csv-url|local.csv>
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "nurseries.json");
const PAGE =
  "https://www.gov.uk/government/statistical-data-sets/childcare-providers-and-inspections-management-information";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const GRADE = { "1": "Outstanding", "2": "Good", "3": "Requires improvement", "4": "Inadequate" };
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};
const Q = String.fromCharCode(34);

function fileTimestamp(u) {
  const m = decodeURIComponent(u).match(/as_at_(\d{1,2})_([A-Za-z]+)_(\d{4})/);
  return m ? Date.UTC(+m[3], (MONTHS[m[2].toLowerCase()] || 1) - 1, +m[1]) : 0;
}

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

const grade = (v) => GRADE[String(v ?? "").trim()];
const isoDate = (v) => {
  const m = String(v ?? "").trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // DD/MM/YYYY
  return m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : undefined;
};
const cleanPC = (pc) => String(pc ?? "").trim().toUpperCase().replace(/\s+/g, " ");

async function getCsvText() {
  const arg = process.argv[2];
  if (arg && !arg.startsWith("http")) {
    console.log("Reading local CSV:", arg);
    return readFile(arg, "utf8");
  }
  let url = arg;
  if (!url) {
    const page = await (await fetch(PAGE, { headers: { "User-Agent": UA } })).text();
    url = [...new Set([...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"]+\.csv/gi)].map((m) => m[0]))]
      .filter((u) => /most_recent_inspections_data/i.test(u))
      .sort((a, b) => fileTimestamp(b) - fileTimestamp(a))[0];
    if (!url) throw new Error("No 'most recent inspections data' CSV link found on gov.uk.");
  }
  console.log("Fetching:", decodeURIComponent(url.split("/").pop()));
  return (await (await fetch(url, { headers: { "User-Agent": UA } })).text()).replace(/^﻿/, "");
}

/** Geocode postcodes via postcodes.io (bulk, 100 at a time), with outcode-centroid fallback. */
async function geocode(postcodes) {
  const coords = new Map();
  const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  const batches = chunk([...postcodes], 100);
  for (let i = 0; i < batches.length; i++) {
    const res = await fetch("https://api.postcodes.io/postcodes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postcodes: batches[i] }),
    });
    const j = await res.json();
    for (const row of j.result ?? []) {
      if (row.result) coords.set(cleanPC(row.query), { lat: row.result.latitude, lng: row.result.longitude });
    }
    if (i % 25 === 0) console.log(`  geocoded ${i * 100}/${postcodes.size}…`);
  }
  // Fallback: outcode centroid for any that failed (terminated/invalid postcodes).
  const missing = [...postcodes].filter((p) => !coords.has(cleanPC(p)));
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
  const text = await getCsvText();
  const lines = text.split(/\r?\n/);
  const hi = lines.findIndex((l) => parseLine(l).some((c) => /provider postcode/i.test(c)));
  if (hi < 0) throw new Error("Could not find the header row (no 'Provider Postcode' column).");
  const hdr = parseLine(lines[hi]).map((h) => h.trim());
  const col = (re) => hdr.findIndex((h) => re.test(h));
  const iUrn = col(/^provider urn/i);
  const iName = col(/^provider name/i);
  const iType = col(/^provider type/i);
  const iStatus = col(/^provider status/i);
  const iEyf = col(/early years register flag/i);
  const iPc = col(/^provider postcode/i);
  const iPlaces = col(/^places$/i);
  const iDate = col(/most recent full: inspection date/i);
  const iEff = col(/most recent full: overall effectiveness/i);
  const iSub = {
    education: col(/^quality of education/i),
    behaviour: col(/^behaviour and attitudes/i),
    personal: col(/^personal development/i),
    leadership: col(/effectiveness of leadership/i),
  };
  if (iUrn < 0 || iPc < 0 || iEff < 0) throw new Error("Expected URN / Postcode / Overall Effectiveness columns.");

  const recs = [];
  const postcodes = new Set();
  for (let r = hi + 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    const x = parseLine(lines[r]);
    const status = (x[iStatus] ?? "").trim().toLowerCase();
    const type = (x[iType] ?? "").trim().toLowerCase();
    const ey = (x[iEyf] ?? "").trim().toUpperCase();
    // Active, non-domestic, Early-Years-registered settings = nurseries / pre-schools.
    if (status !== "active") continue;
    if (!type.includes("non-domestic")) continue;
    if (ey !== "Y") continue;
    const pc = cleanPC(x[iPc]);
    if (!pc) continue;
    const sub = {};
    for (const [k, ci] of Object.entries(iSub)) {
      const g = ci >= 0 ? grade(x[ci]) : undefined;
      if (g) sub[k] = g;
    }
    const places = iPlaces >= 0 ? parseInt(x[iPlaces], 10) : NaN;
    recs.push({
      urn: (x[iUrn] ?? "").trim(),
      name: (x[iName] ?? "").trim(),
      postcode: pc,
      rating: grade(x[iEff]),
      date: iDate >= 0 ? isoDate(x[iDate]) : undefined,
      places: Number.isFinite(places) ? places : undefined,
      sub: Object.keys(sub).length ? sub : undefined,
    });
    postcodes.add(pc);
  }
  console.log(`Filtered to ${recs.length} active non-domestic early-years settings; ${postcodes.size} unique postcodes. Geocoding…`);

  const coords = await geocode(postcodes);
  const out = [];
  let dropped = 0;
  for (const rec of recs) {
    const c = coords.get(rec.postcode);
    if (!c) { dropped++; continue; }
    out.push({ ...rec, lat: Math.round(c.lat * 1e5) / 1e5, lng: Math.round(c.lng * 1e5) / 1e5 });
  }
  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${out.length} nurseries → ${OUT}  (${dropped} dropped: un-geocodable postcode)`);
}

main().catch((e) => {
  console.error("nurseries ETL failed:", e.message);
  process.exit(1);
});
