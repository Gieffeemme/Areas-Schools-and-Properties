#!/usr/bin/env node
/**
 * Build src/data/stations.json — the nearest-station dataset behind the Transport panel/card.
 * GB rail / metro / tram / light-rail stations from OpenStreetMap via Overpass, fetched ONCE here so
 * the runtime lookup (src/lib/transport.ts → nearestStations) is a committed-JSON read with no
 * per-request Overpass call: instant, rate-limit-free, never null. (The public Overpass instance
 * rate-limits under load, which made the old runtime fetch flaky — this moves that risk to build time,
 * where it's a one-off and retryable.)
 *
 * Stop nodes only (railway=station|halt|tram_stop — not platforms), classified rail / metro /
 * light_rail / tram from the SAME tags the runtime used, deduped to one point per station. The bbox
 * spans the UK (a handful of Republic-of-Ireland stations ride along; harmless, and occasionally the
 * genuine nearest for a border postcode).
 *   npm run etl:stations
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "stations.json");
const UA = "Locale/1.0 (area-intel; +https://github.com/Gieffeemme/Areas-Schools-and-Properties)";
// Public Overpass mirrors, tried in order (they rate-limit / wobble independently).
const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
// UK bounding box (S,W,N,E).
const BBOX = "49.8,-8.7,60.9,1.8";
const QUERY =
  `[out:json][timeout:180];(` +
  `nwr["railway"="station"](${BBOX});` +
  `nwr["railway"="halt"](${BBOX});` +
  `nwr["railway"="tram_stop"](${BBOX});` +
  `);out center tags;`;

// Same classification the runtime used: subway → metro, light_rail → light_rail, tram_stop → tram.
function classify(t) {
  if (t.railway === "tram_stop" || t.station === "tram") return "tram";
  if (t.station === "subway" || t.subway === "yes") return "metro";
  if (t.station === "light_rail" || t.light_rail === "yes") return "light_rail";
  return "rail";
}

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

async function main() {
  const els = await fetchOverpass();
  const byKey = new Map();
  for (const e of els) {
    const tags = e.tags ?? {};
    const name = (tags.name ?? "").trim();
    if (!name) continue; // nameless nodes are noise for a "nearest named station" lookup
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat == null || lon == null) continue;
    const kind = classify(tags);
    // Dedupe multi-mapped nodes of one station; a ~1 km grid keeps distinct same-named stations apart.
    const key = `${name.toLowerCase()}|${kind}|${lat.toFixed(2)}|${lon.toFixed(2)}`;
    if (byKey.has(key)) continue;
    byKey.set(key, {
      name,
      kind,
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lon * 1e5) / 1e5,
    });
  }
  const stations = [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (stations.length < 2000)
    throw new Error(`only ${stations.length} stations — looks truncated, refusing to write`);

  const counts = {};
  for (const s of stations) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
  await writeFile(OUT, JSON.stringify(stations) + "\n");
  console.log(`Wrote ${stations.length} stations → ${OUT}`);
  console.log(`  by kind: ${JSON.stringify(counts)}`);
}

main().catch((e) => {
  console.error("Stations ETL failed:", e.message);
  process.exit(1);
});
