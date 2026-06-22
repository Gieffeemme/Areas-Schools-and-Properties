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

// Keep only meaningful GIAS field values (drop placeholders); numbers must be positive.
const numOf = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const strOf = (v) => {
  const s = String(v ?? "").trim();
  return s && !/^(not applicable|does not apply|unknown)$/i.test(s) ? s : undefined;
};

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

// OSGB36 National Grid (Easting/Northing) -> WGS84 lat/lng. Projection verified against the OS
// worked example to <1cm; Helmert datum shift uses the standard OSGB36->WGS84 parameters (~5m).
function osgbToWgs84(E, N) {
  const a = 6377563.396, b = 6356256.909, F0 = 0.9996012717; // Airy 1830
  const phi0 = (49 * Math.PI) / 180, lam0 = (-2 * Math.PI) / 180, N0 = -100000, E0 = 400000;
  const e2 = 1 - (b * b) / (a * a), n = (a - b) / (a + b), n2 = n * n, n3 = n * n * n;
  let phi = phi0, M = 0;
  do {
    phi = (N - N0 - M) / (a * F0) + phi;
    const dp = phi - phi0, sp = phi + phi0;
    const Ma = (1 + n + 1.25 * n2 + 1.25 * n3) * dp;
    const Mb = (3 * n + 3 * n2 + 2.625 * n3) * Math.sin(dp) * Math.cos(sp);
    const Mc = (1.875 * n2 + 1.875 * n3) * Math.sin(2 * dp) * Math.cos(2 * sp);
    const Md = (35 / 24) * n3 * Math.sin(3 * dp) * Math.cos(3 * sp);
    M = b * F0 * (Ma - Mb + Mc - Md);
  } while (Math.abs(N - N0 - M) >= 0.00001);
  const s = Math.sin(phi), c = Math.cos(phi), t = Math.tan(phi);
  const nu = (a * F0) / Math.sqrt(1 - e2 * s * s);
  const rho = (a * F0 * (1 - e2)) / Math.pow(1 - e2 * s * s, 1.5);
  const eta2 = nu / rho - 1, t2 = t * t, t4 = t2 * t2, t6 = t4 * t2, sec = 1 / c;
  const VII = t / (2 * rho * nu);
  const VIII = (t / (24 * rho * nu ** 3)) * (5 + 3 * t2 + eta2 - 9 * t2 * eta2);
  const IX = (t / (720 * rho * nu ** 5)) * (61 + 90 * t2 + 45 * t4);
  const X = sec / nu;
  const XI = (sec / (6 * nu ** 3)) * (nu / rho + 2 * t2);
  const XII = (sec / (120 * nu ** 5)) * (5 + 28 * t2 + 24 * t4);
  const XIIA = (sec / (5040 * nu ** 7)) * (61 + 662 * t2 + 1320 * t4 + 720 * t6);
  const dE = E - E0;
  const phiA = phi - VII * dE * dE + VIII * dE ** 4 - IX * dE ** 6;
  const lamA = lam0 + X * dE - XI * dE ** 3 + XII * dE ** 5 - XIIA * dE ** 7;
  // Airy lat/lon -> Cartesian -> Helmert (OSGB36->WGS84) -> WGS84 lat/lon
  const nu1 = a / Math.sqrt(1 - e2 * Math.sin(phiA) ** 2);
  const x = nu1 * Math.cos(phiA) * Math.cos(lamA);
  const y = nu1 * Math.cos(phiA) * Math.sin(lamA);
  const z = (1 - e2) * nu1 * Math.sin(phiA);
  const as = Math.PI / (180 * 3600), sc = -20.4894e-6;
  const rx = 0.1502 * as, ry = 0.247 * as, rz = 0.8421 * as;
  const x2 = 446.448 + (1 + sc) * x - rz * y + ry * z;
  const y2 = -125.157 + rz * x + (1 + sc) * y - rx * z;
  const z2 = 542.06 - ry * x + rx * y + (1 + sc) * z;
  const A = 6378137, B = 6356752.3142, eb = 1 - (B * B) / (A * A), p = Math.sqrt(x2 * x2 + y2 * y2);
  let lat = Math.atan2(z2, p * (1 - eb));
  for (let i = 0; i < 8; i++) {
    const v = A / Math.sqrt(1 - eb * Math.sin(lat) ** 2);
    lat = Math.atan2(z2 + eb * v * Math.sin(lat), p);
  }
  return { lat: (lat * 180) / Math.PI, lng: (Math.atan2(y2, x2) * 180) / Math.PI };
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
    e: col(/^easting$/i),
    n: col(/^northing$/i),
    type: col(/^typeofestablishment \(name\)/i),
    gender: col(/^gender \(name\)/i),
    religion: col(/^religiouscharacter \(name\)/i),
    lowAge: col(/^statutorylowage$/i),
    highAge: col(/^statutoryhighage$/i),
    pupils: col(/^numberofpupils$/i),
    admissions: col(/^admissionspolicy \(name\)/i),
  };
  if (C.urn < 0 || C.phase < 0 || C.pc < 0) throw new Error("Missing expected GIAS columns (URN/phase/postcode).");
  // Surface which optional columns resolved (-1 = header not found → field will be absent).
  console.log("extra columns:", JSON.stringify({ type: C.type, gender: C.gender, religion: C.religion, lowAge: C.lowAge, highAge: C.highAge, pupils: C.pupils, admissions: C.admissions }));

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
    const e = Number(x[C.e]), n = Number(x[C.n]);
    const hasEN = Number.isFinite(e) && Number.isFinite(n) && e > 0 && n > 0;
    if (!hasEN && !pc) continue; // no location at all
    const rec = { urn: (x[C.urn] ?? "").trim(), name: (x[C.name] ?? "").trim(), postcode: pc, phase };
    // GIAS metadata we surface on the card and as map filters (kept only when meaningful).
    rec.pupils = numOf(x[C.pupils]);
    rec.ageLow = numOf(x[C.lowAge]);
    rec.ageHigh = numOf(x[C.highAge]);
    rec.type = strOf(x[C.type]);
    rec.admissions = strOf(x[C.admissions]);
    const gen = String(x[C.gender] ?? "").trim();
    rec.gender = /^(boys|girls|mixed)$/i.test(gen) ? gen : undefined;
    const rel = String(x[C.religion] ?? "").trim();
    rec.religion = rel && !/^(none|does not apply|not applicable|unknown)$/i.test(rel) ? rel : undefined;
    if (hasEN) { rec.e = e; rec.n = n; }
    else postcodes.add(pc); // only the few without a grid ref need postcode geocoding
    recs.push(rec);
  }
  console.log(`Kept ${recs.length} open schools; ${postcodes.size} need postcode geocoding (no grid ref).`);

  const coords = postcodes.size ? await geocode(postcodes) : new Map();
  const out = [];
  let dropped = 0, viaEN = 0, viaPC = 0;
  for (const rec of recs) {
    let lat, lng;
    if (rec.e != null) {
      ({ lat, lng } = osgbToWgs84(rec.e, rec.n)); // precise: exact building from the grid ref
      viaEN++;
    } else {
      const c = coords.get(rec.postcode);
      if (!c) { dropped++; continue; }
      ({ lat, lng } = c);
      viaPC++;
    }
    const o = { urn: rec.urn, name: rec.name, postcode: rec.postcode, phase: rec.phase, lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lng * 1e5) / 1e5 };
    if (rec.pupils != null) o.pupils = rec.pupils;
    if (rec.gender) o.gender = rec.gender;
    if (rec.type) o.type = rec.type;
    if (rec.religion) o.religion = rec.religion;
    if (rec.ageLow != null) o.ageLow = rec.ageLow;
    if (rec.ageHigh != null) o.ageHigh = rec.ageHigh;
    if (rec.admissions) o.admissions = rec.admissions;
    out.push(o);
  }
  await writeFile(OUT, JSON.stringify(out) + "\n");
  const byPhase = {};
  for (const o of out) byPhase[o.phase] = (byPhase[o.phase] || 0) + 1;
  console.log(`Wrote ${out.length} schools → ${OUT}  (${viaEN} precise grid ref, ${viaPC} postcode; ${dropped} dropped)`);
  console.log("by phase:", JSON.stringify(byPhase));
}

main().catch((e) => {
  console.error("GIAS ETL failed:", e.message);
  process.exit(1);
});
