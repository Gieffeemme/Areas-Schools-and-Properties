#!/usr/bin/env node
/**
 * Build src/data/workforce-by-urn.json from the DfE School Workforce Census, keyed by URN:
 * pupil:teacher ratio (PTR) and teacher FTE, taking each school's most recent reported year.
 *
 * Source: Explore Education Statistics — "Pupil to teacher ratios - school level" data set
 * (data-catalogue CSV; needs a browser UA). The file is ~62 MB and covers every year + geography,
 * so we keep geographic_level=School and the latest time_period per URN.
 *   npm run etl:workforce
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "workforce-by-urn.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
// "Pupil to teacher ratios - school level" data set (School workforce in England).
const DATASET = "f63c85d9-1c8f-4b3d-a5b5-2ef6e2dbd7ef";
const URL = `https://explore-education-statistics.service.gov.uk/data-catalogue/data-set/${DATASET}/csv`;

function parseLine(l) {
  const out = [];
  let f = "";
  let q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) {
      if (c === '"') {
        if (l[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(f);
      f = "";
    } else f += c;
  }
  out.push(f);
  return out;
}

// EES marks suppressed/not-applicable cells with letters (c, x, z, :, low) — those become null.
const num = (v) => {
  const s = (v ?? "").trim();
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

async function main() {
  console.log("Fetching School Workforce PTR (school level) from EES… (~62 MB, please wait)");
  const res = await fetch(URL, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);

  const h = parseLine(lines[0]);
  const i = (n) => h.indexOf(n);
  const iGeo = i("geographic_level");
  const iUrn = i("school_urn");
  const iTp = i("time_period");
  const iPtr = i("pupil_to_qual_teacher_ratio");
  const iTeach = i("teachers_fte");
  const iAdults = i("adults_fte"); // all staff (teachers + support), FTE
  if (iUrn < 0 || iPtr < 0 || iTp < 0)
    throw new Error("Expected school_urn / pupil_to_qual_teacher_ratio / time_period columns.");

  const out = {};
  const latest = {}; // urn -> most recent time_period kept
  let schoolRows = 0;
  for (let r = 1; r < lines.length; r++) {
    if (!lines[r]) continue;
    const x = parseLine(lines[r]);
    if ((x[iGeo] ?? "").trim() !== "School") continue;
    const urn = (x[iUrn] ?? "").trim();
    if (!/^\d+$/.test(urn)) continue;
    const tp = Number((x[iTp] ?? "").trim());
    if (!Number.isFinite(tp)) continue;
    const ptr = num(x[iPtr]);
    const teachersFte = num(x[iTeach]);
    const staffFte = num(x[iAdults]);
    if (ptr == null && teachersFte == null && staffFte == null) continue; // suppressed/empty row
    schoolRows++;
    if (latest[urn] == null || tp > latest[urn]) {
      latest[urn] = tp;
      const s = String(tp);
      out[urn] = { ptr, teachersFte, staffFte, year: `${s.slice(0, 4)}/${s.slice(4)}` };
    }
  }

  await writeFile(OUT, JSON.stringify(out) + "\n");
  console.log(`Wrote ${Object.keys(out).length} workforce records (from ${schoolRows} school rows) → ${OUT}`);
}

main().catch((e) => {
  console.error("workforce ETL failed:", e.message);
  process.exit(1);
});
