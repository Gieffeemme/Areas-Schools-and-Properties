#!/usr/bin/env node
/**
 * Build src/data/bathing-waters.json — England's designated bathing waters (beaches + some inland lakes/
 * rivers) with their latest annual water-quality classification, from the Environment Agency's bathing-
 * water linked-data API (free, OGL). Read at runtime by src/lib/bathingWater.ts as a committed radius
 * lookup (the set is small and static-ish), surfacing only the nearest one within a coastal threshold.
 *
 * Source (ELDA linked-data; `_properties` selects just the nested fields we need — `_view=all` 504s
 * over the whole set):
 *   https://environment.data.gov.uk/doc/bathing-water.json?_pageSize=...&_properties=name,samplingPoint.lat,samplingPoint.long,latestComplianceAssessment.complianceClassification.name
 * Per water we keep: name, samplingPoint lat/long, and latestComplianceAssessment → complianceClassification
 * name (Excellent / Good / Sufficient / Poor; "" if newly designated / not yet classified).
 *   npm run etl:bathing-water
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "bathing-waters.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const LIST =
  "https://environment.data.gov.uk/doc/bathing-water.json?_pageSize=800" +
  "&_properties=name,samplingPoint.lat,samplingPoint.long,latestComplianceAssessment.complianceClassification.name";

// EA JSON wraps literals as { _value, _lang } (or arrays of them); unwrap to a plain string.
function val(x) {
  if (x == null) return "";
  if (typeof x === "string") return x;
  if (Array.isArray(x)) return val(x[0]);
  if (typeof x === "object" && "_value" in x) return String(x._value);
  return "";
}

async function main() {
  console.log("Fetching EA bathing-water list…");
  const res = await fetch(LIST, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`EA API returned ${res.status}`);
  const data = await res.json();
  const items = (data.result && data.result.items) || [];
  console.log(`  ${items.length} bathing waters returned`);

  const out = [];
  let noCoord = 0;
  for (const it of items) {
    const sp = it.samplingPoint || {};
    const lat = Number(sp.lat);
    const lng = Number(sp.long);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      noCoord++;
      continue;
    }
    const cls = val(
      it.latestComplianceAssessment &&
        it.latestComplianceAssessment.complianceClassification &&
        it.latestComplianceAssessment.complianceClassification.name,
    );
    out.push({
      name: val(it.name) || val(it.label),
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
      cls, // Excellent | Good | Sufficient | Poor | ""
    });
  }

  if (out.length < 300)
    throw new Error(`only ${out.length} bathing waters — looks truncated, refusing to write`);

  const byClass = {};
  for (const b of out) byClass[b.cls || "(unclassified)"] = (byClass[b.cls || "(unclassified)"] ?? 0) + 1;
  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${out.length} bathing waters → ${OUT}  (skipped ${noCoord} without coords)`);
  console.log("  by classification:", JSON.stringify(byClass));
}

main().catch((e) => {
  console.error("bathing-water ETL failed:", e.message);
  process.exit(1);
});
