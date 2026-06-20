#!/usr/bin/env node
/**
 * Build src/data/ofsted-by-urn.json from the official DfE "Get Information About Schools"
 * (GIAS) all-establishments CSV, keyed by URN. The app joins these ratings onto live
 * OpenStreetMap school pins via the URN (OSM tag `ref:edubase`).
 *
 * Usage:
 *   npm run etl:schools                                  # download today's GIAS CSV
 *   GIAS_CSV_URL=<url> npm run etl:schools               # override the source URL
 *   node scripts/etl/build-schools.mjs path/to/file.csv  # use an already-downloaded CSV
 *
 * Note: the gov.uk GIAS download endpoint is date-stamped and sometimes returns 5xx. If the
 * network fetch fails, download "Establishment fields CSV (all establishments)" manually from
 *   https://get-information-schools.service.gov.uk/Downloads
 * and pass the local path as an argument.
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "ofsted-by-urn.json");

function giasUrlFor(date) {
  const stamp = date.toISOString().slice(0, 10).replace(/-/g, "");
  return `https://ea-edubase-api-prod.azurewebsites.net/edubase/downloads/public/edubasealldata${stamp}.csv`;
}

async function getCsv() {
  const localArg = process.argv[2];
  if (localArg) {
    console.log(`Reading local CSV: ${localArg}`);
    return readFile(localArg, "utf8");
  }

  const urls = [];
  if (process.env.GIAS_CSV_URL) urls.push(process.env.GIAS_CSV_URL);
  const today = new Date();
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    urls.push(giasUrlFor(d));
  }

  for (const url of urls) {
    try {
      process.stdout.write(`Fetching ${url} … `);
      const res = await fetch(url);
      if (!res.ok) {
        console.log(`HTTP ${res.status}`);
        continue;
      }
      console.log("ok");
      return res.text();
    } catch (e) {
      console.log(`failed (${e.message})`);
    }
  }

  throw new Error(
    "Could not download the GIAS CSV (gov.uk endpoint unavailable). Download it manually from " +
      "https://get-information-schools.service.gov.uk/Downloads and pass the file path as an argument.",
  );
}

// Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes, embedded newlines.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function normaliseRating(raw) {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "outstanding") return "Outstanding";
  if (s === "good") return "Good";
  if (s === "requires improvement" || s === "satisfactory") return "Requires improvement";
  if (["inadequate", "serious weaknesses", "special measures"].includes(s)) return "Inadequate";
  return "Not rated";
}

async function main() {
  const csv = await getCsv();
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new Error("CSV looks empty");

  const header = rows[0];
  const col = (name) => header.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  const iUrn = col("URN");
  const iName = col("EstablishmentName");
  const iStatus = col("EstablishmentStatus (name)");
  const iRating = col("OfstedRating (name)");
  const iDate = col("OfstedLastInsp");

  if (iUrn < 0 || iRating < 0) {
    throw new Error("Unexpected GIAS columns — expected 'URN' and 'OfstedRating (name)'.");
  }

  const out = {};
  let open = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const urn = row[iUrn]?.trim();
    if (!urn) continue;

    const status = iStatus >= 0 ? (row[iStatus] ?? "") : "Open";
    if (status.toLowerCase().startsWith("closed")) continue;
    open++;

    const rating = normaliseRating(row[iRating]);
    if (rating === "Not rated") continue;

    out[urn] = {
      rating,
      date: iDate >= 0 ? row[iDate] || undefined : undefined,
      name: iName >= 0 ? row[iName] || undefined : undefined,
    };
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`\nWrote ${Object.keys(out).length} Ofsted-rated schools (of ${open} open) → ${OUT}`);
}

main().catch((e) => {
  console.error("\nETL failed:", e.message);
  process.exit(1);
});
