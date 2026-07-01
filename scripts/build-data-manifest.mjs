// Builds src/data/data-manifest.json — a small index of every committed dataset with its record
// count, byte size, and the date its file was last committed (its "vintage"). /api/health reads
// this at runtime to report which datasets are getting stale.
//
// The last-committed date comes from `git log`, so this MUST run where full history is available:
// locally, or in CI with `fetch-depth: 0`. We do NOT generate it during the Vercel build (shallow
// clone → no history); instead the manifest is committed to the repo and read as-is at runtime.
//
//   node scripts/build-data-manifest.mjs      (or: npm run data:manifest)

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const DATA_DIR = path.join(process.cwd(), "src", "data");
const OUT = path.join(DATA_DIR, "data-manifest.json");
const SELF = "data-manifest.json";

// Best-effort record count across the shapes our ETLs emit: a plain array, a big code→value map, or
// a small wrapper object like {generatedAt, …, byLsoa:{…}} where the real payload is nested.
function sizeOf(v) {
  if (Array.isArray(v)) return v.length;
  if (v && typeof v === "object") return Object.keys(v).length;
  return 0;
}
function countRecords(json) {
  if (Array.isArray(json)) return json.length;
  if (json && typeof json === "object") {
    const keys = Object.keys(json);
    if (keys.length > 10) return keys.length; // keyed map: code → record
    // small wrapper → sum the collection-valued props (skips scalar metadata like generatedAt)
    const sum = keys.reduce((n, k) => n + sizeOf(json[k]), 0);
    return sum > 0 ? sum : keys.length;
  }
  return null;
}

function lastCommitISO(file) {
  try {
    const out = execSync(`git log -1 --format=%cI -- "src/data/${file}"`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

const files = fs
  .readdirSync(DATA_DIR)
  .filter((f) => f.endsWith(".json") && f !== SELF)
  .sort();

const datasets = files.map((file) => {
  const fp = path.join(DATA_DIR, file);
  const bytes = fs.statSync(fp).size;
  let records = null;
  try {
    records = countRecords(JSON.parse(fs.readFileSync(fp, "utf8")));
  } catch {
    records = null; // unreadable/huge — still report size + date
  }
  const gitDate = lastCommitISO(file);
  const lastCommit = gitDate || fs.statSync(fp).mtime.toISOString();
  return { file, records, bytes, lastCommit, dateSource: gitDate ? "git" : "mtime" };
});

const manifest = {
  generatedAt: new Date().toISOString(),
  datasetCount: datasets.length,
  datasets,
};

fs.writeFileSync(OUT, JSON.stringify(manifest, null, 2) + "\n");
const missing = datasets.filter((d) => d.dateSource !== "git").length;
console.log(
  `data-manifest.json written: ${datasets.length} datasets` +
    (missing ? ` (${missing} fell back to mtime — run with full git history for accurate vintages)` : ""),
);
