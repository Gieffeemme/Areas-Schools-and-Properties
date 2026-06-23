#!/usr/bin/env node
/**
 * Build src/data/amenities.json — committed everyday-amenity coordinates for the Amenities panel, so
 * the runtime lookup (src/lib/amenities.ts → nearbyAmenities) is a committed-data read with NO
 * per-request Overpass call (instant, rate-limit-free). Sourced once here from OSM via Overpass.
 *
 * Seven categories (supermarkets, convenience, GP surgeries, pharmacies, parks, gyms, cafés/
 * restaurants), national, queried per category with `out center;` (coords only — the category is known
 * by which query ran, so tags aren't needed, keeping responses lean). The "station" count is served at
 * runtime from stations.json (etl:stations); BUS STOPS are intentionally excluded (~370k nationally,
 * low signal — rail/metro/tram is the Transport panel). Stored as {category: [[lat,lng], …]} (5 dp).
 *   npm run etl:amenities
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "amenities.json");
const UA = "Locale/1.0 (area-intel; +https://github.com/Gieffeemme/Areas-Schools-and-Properties)";
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const WEST = "-8.7";
const EAST = "1.8";
const bbox = (s, n) => `${s},${WEST},${n},${EAST}`; // (S,W,N,E) — UK (a few ROI POIs ride along; harmless)
// Latitude bands for the tiled fallback: a single national query for polygon-heavy categories (parks)
// 504s on the public Overpass, so on failure we re-query in bands and merge (coords are deduped anyway).
const BANDS = [
  [49.8, 52.0],
  [52.0, 53.5],
  [53.5, 55.5],
  [55.5, 60.9],
];

// Each category's Overpass selector(s); must match the runtime category keys/labels in amenities.ts.
const CATEGORIES = [
  { key: "supermarket", selectors: [`nwr["shop"="supermarket"]`] },
  { key: "convenience", selectors: [`nwr["shop"="convenience"]`] },
  { key: "gp", selectors: [`nwr["amenity"="doctors"]`] },
  { key: "pharmacy", selectors: [`nwr["amenity"="pharmacy"]`] },
  { key: "park", selectors: [`nwr["leisure"="park"]`] },
  { key: "gym", selectors: [`nwr["leisure"="fitness_centre"]`] },
  { key: "dining", selectors: [`nwr["amenity"="restaurant"]`, `nwr["amenity"="cafe"]`] },
];

async function queryBBox(selector, box) {
  const q = `[out:json][timeout:180];${selector}(${box});out center;`;
  let lastErr;
  for (const url of ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "User-Agent": UA, "Content-Type": "text/plain" },
          body: q,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!data.elements) throw new Error("no elements field");
        return data.elements;
      } catch (e) {
        lastErr = e;
        console.warn(`    ${url.split("/")[2]} attempt ${attempt}: ${e.message}`);
      }
    }
  }
  throw new Error(`Overpass failed: ${lastErr?.message}`);
}

// Try one national query; if it fails (polygon-heavy categories like parks 504), re-query in bands.
async function fetchSelector(selector) {
  try {
    return await queryBBox(selector, bbox(49.8, 60.9));
  } catch (e) {
    console.warn(`  whole-UK query failed (${e.message}); retrying in ${BANDS.length} latitude bands…`);
    const all = [];
    for (const [s, n] of BANDS) all.push(...(await queryBBox(selector, bbox(s, n))));
    return all;
  }
}

async function main() {
  const out = {};
  let total = 0;
  for (const c of CATEGORIES) {
    const seen = new Set();
    const pts = [];
    for (const sel of c.selectors) {
      console.log(`Fetching ${c.key} (${sel})…`);
      const els = await fetchSelector(sel);
      for (const e of els) {
        const lat = e.lat ?? e.center?.lat;
        const lon = e.lon ?? e.center?.lon;
        if (lat == null || lon == null) continue;
        const la = Math.round(lat * 1e5) / 1e5;
        const ln = Math.round(lon * 1e5) / 1e5;
        const key = `${la},${ln}`;
        if (seen.has(key)) continue; // collapse a feature mapped as both a node and a way/relation
        seen.add(key);
        pts.push([la, ln]);
      }
    }
    if (pts.length < 500)
      throw new Error(`${c.key}: only ${pts.length} points — looks truncated, refusing to write`);
    out[c.key] = pts;
    total += pts.length;
    console.log(`  ${c.key}: ${pts.length}`);
  }
  if (total < 80000) throw new Error(`only ${total} total points — looks truncated, refusing to write`);
  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${total} amenity points across ${CATEGORIES.length} categories → ${OUT}`);
}

main().catch((e) => {
  console.error("Amenities ETL failed:", e.message);
  process.exit(1);
});
