#!/usr/bin/env node
/**
 * Build src/data/ev-charging.json — public EV charging locations across the UK, from OpenStreetMap via
 * Overpass, fetched ONCE here so the runtime lookup (src/lib/evCharging.ts → nearbyEvCharging) is a
 * committed-JSON read with no per-request Overpass call (instant, rate-limit-free), exactly like
 * build-stations.mjs.
 *
 * Why OSM: the official **National Chargepoint Registry was decommissioned on 28 Nov 2024** (its API
 * host no longer resolves); the replacement is fragmented per-operator open-data feeds with no single
 * national endpoint. OSM's `amenity=charging_station` is the practical free (ODbL) national source.
 * Coverage of location + `operator` + `capacity` (number of charge points) is good; connector type and
 * power are too sparsely tagged to surface, so we keep just position, operator and capacity.
 *   npm run etl:ev-charging
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "ev-charging.json");
const UA = "Locale/1.0 (area-intel; +https://github.com/Gieffeemme/Areas-Schools-and-Properties)";
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
// UK bounding box (S,W,N,E) - same as build-stations.mjs.
const BBOX = "49.8,-8.7,60.9,1.8";
const QUERY =
  `[out:json][timeout:180];(` +
  `nwr["amenity"="charging_station"](${BBOX});` +
  `);out center tags;`;

async function fetchOverpass() {
  let lastErr;
  for (const url of ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Querying ${url} (attempt ${attempt})…`);
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "text/plain" },
          body: QUERY,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.elements?.length) throw new Error("empty element set");
        return data.elements;
      } catch (e) {
        lastErr = e;
        console.warn(`  failed: ${e.message}`);
      }
    }
  }
  throw new Error(`all Overpass endpoints failed: ${lastErr?.message}`);
}

// Number of charge points at a site (OSM `capacity`); a positive integer, else null.
function capacity(tags) {
  const n = parseInt(String(tags.capacity ?? "").trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function main() {
  const els = await fetchOverpass();
  const byKey = new Map();
  for (const e of els) {
    const tags = e.tags ?? {};
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;
    const op = (tags.operator || tags.network || tags.name || "").trim();
    const cap = capacity(tags);
    // Dedupe exact duplicates (same operator + ~10 m cell); keeps genuinely distinct nearby sites apart.
    const key = `${op.toLowerCase()}|${lat.toFixed(4)}|${lon.toFixed(4)}`;
    if (byKey.has(key)) continue;
    const rec = { lat: Math.round(lat * 1e5) / 1e5, lng: Math.round(lon * 1e5) / 1e5 };
    if (op) rec.op = op;
    if (cap) rec.cap = cap;
    byKey.set(key, rec);
  }

  const sites = [...byKey.values()];
  if (sites.length < 5000)
    throw new Error(`only ${sites.length} charging sites — looks truncated, refusing to write`);

  const withOp = sites.filter((s) => s.op).length;
  const withCap = sites.filter((s) => s.cap).length;
  await writeFile(OUT, JSON.stringify(sites) + "\n");
  console.log(`Wrote ${sites.length} EV charging sites → ${OUT}`);
  console.log(`  with operator: ${withOp} (${Math.round((100 * withOp) / sites.length)}%) · with capacity: ${withCap} (${Math.round((100 * withCap) / sites.length)}%)`);
}

main().catch((e) => {
  console.error("EV-charging ETL failed:", e.message);
  process.exit(1);
});
