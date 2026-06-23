#!/usr/bin/env node
/**
 * Build src/data/ofsted-by-urn.json from Ofsted's "state-funded schools - latest inspections" MI
 * (a CSV, refreshed monthly), keyed by URN. We take each school's CURRENT inspection so grades are
 * up to date — the old build pinned to the "as at 31 Aug 2024" snapshot, which showed years-old
 * grades for any school re-inspected since (and could surface a stale, even defamatory, "Inadequate").
 *
 * Ofsted now runs three frameworks, all present in this file as separate column blocks:
 *   - NEW report card (Nov 2025+): per-area 5-band grades (Exceptional … Urgent improvement) +
 *     safeguarding "Met/Not met" + category of concern.
 *   - OEIF graded (the previous EIF): overall (1-4) + sub-judgements. From Sept 2024 Ofsted stopped
 *     giving a single overall grade, so "overall effectiveness" reads "Not judged" — but the
 *     sub-judgements are still graded.
 *   - Ungraded (monitoring) — no grades; ignored for the headline.
 * We use the most recent of the report-card / OEIF inspections.
 *
 * Output record per URN (all optional except date):
 *   { date, name, rating?, sub?, card? }
 *     rating  – overall grade, ONLY when one was genuinely given (omitted for "Not judged"/report card)
 *     sub     – OEIF sub-judgements {education,behaviour,personal,leadership,eyfs,sixthForm} (words)
 *     card    – new report card { date, safeguarding, concern, areas:{<key>:<band code>} }
 *
 * Source: https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes
 *   npm run etl:schools                 (auto-finds the latest "latest inspections" CSV)
 *   node scripts/etl/build-schools.mjs <url|file.csv>
 */
import { writeFile, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "ofsted-by-urn.json");
const PAGE =
  "https://www.gov.uk/government/statistical-data-sets/monthly-management-information-ofsteds-school-inspections-outcomes";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

const GRADE = { "1": "Outstanding", "2": "Good", "3": "Requires improvement", "4": "Inadequate" };
const BAND = {
  exceptional: "exceptional",
  "strong standard": "strong",
  "expected standard": "expected",
  "needs attention": "needs-attention",
  "urgent improvement": "urgent",
};
const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");

const clean = (v) => {
  const s = String(v ?? "").trim();
  return s && s.toUpperCase() !== "NULL" ? s : "";
};
const overallGrade = (v) => GRADE[clean(v)]; // undefined for "Not judged" / blank
const bandOf = (v) => BAND[clean(v).toLowerCase()];

// DD/MM/YYYY (MI CSV) -> ISO. Returns "" when blank/unparseable.
function isoDate(v) {
  const s = clean(v);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(s);
  return !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

// Sortable key from an "as at 31 May 2026"-style label, for picking the newest snapshot.
function asAtKey(s) {
  const m = s.match(/(\d{1,2})[_ ]([A-Za-z]+)[_ ](\d{4})/);
  if (!m) return 0;
  const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
  return mi < 0 ? 0 : Number(m[3]) * 10000 + (mi + 1) * 100 + Number(m[1]);
}

// Minimal RFC-4180 CSV parser (handles quoted fields with embedded commas/quotes/newlines).
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function getCsv() {
  const arg = process.argv[2];
  if (arg && !arg.startsWith("http")) {
    console.log("Reading local CSV:", arg);
    return readFile(arg, "latin1");
  }
  let url = arg;
  if (!url) {
    const page = await (await fetch(PAGE, { headers: { "User-Agent": UA } })).text();
    const links = [
      ...page.matchAll(/https:\/\/assets\.publishing\.service\.gov\.uk\/media\/[^"]+\.csv/g),
    ]
      .map((m) => decodeURIComponent(m[0]))
      .filter((u) => /state.funded.*latest.inspections/i.test(u));
    url = links.sort((a, b) => asAtKey(b) - asAtKey(a))[0];
    if (!url) throw new Error("No 'state-funded latest inspections' CSV link found on the gov.uk page.");
  }
  console.log("Fetching:", url.split("/").pop());
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`gov.uk returned ${res.status}`);
  return Buffer.from(await res.arrayBuffer()).toString("latin1");
}

// New-framework report-card evaluation areas → our keys.
const CARD_AREAS = {
  inclusion: "Inclusion",
  curriculum: "Curriculum and teaching",
  achievement: "Achievement",
  behaviour: "Attendance and behaviour",
  personal: "Personal development and wellbeing",
  earlyYears: "Early years (where applicable)",
  postSixteen: "Post-16 provision (where applicable)",
  leadership: "Leadership and governance",
};
// OEIF sub-judgement columns → our keys.
const OEIF_SUB = {
  education: "Latest OEIF quality of education",
  behaviour: "Latest OEIF behaviour and attitudes",
  personal: "Latest OEIF personal development",
  leadership: "Latest OEIF effectiveness of leadership and management",
  eyfs: "Latest OEIF early years provision (where applicable)",
  sixthForm: "Latest OEIF sixth form provision (where applicable)",
};

async function main() {
  const rows = parseCsv(await getCsv());
  const hi = rows.findIndex((r) => r.some((c) => c.trim().toLowerCase() === "urn"));
  if (hi < 0) throw new Error("Could not find a header row containing a URN column.");
  const hdr = rows[hi].map((h) => h.trim());
  const ix = (name) => hdr.indexOf(name);
  const at = (row, name) => {
    const i = ix(name);
    return i >= 0 ? row[i] : "";
  };
  const iUrn = ix("URN");
  if (iUrn < 0) throw new Error("No URN column.");

  const out = {};
  let graded = 0, notJudged = 0, reportCard = 0;
  for (let r = hi + 1; r < rows.length; r++) {
    const row = rows[r];
    const urn = clean(row[iUrn]);
    if (!/^\d+$/.test(urn)) continue;

    const fullDate = isoDate(at(row, "Inspection start date")); // new report-card framework
    const oeifDate = isoDate(at(row, "Inspection start date of latest OEIF graded inspection"));
    const name = clean(at(row, "School name")) || undefined;

    // Prefer the most recent inspection.
    if (fullDate && fullDate >= (oeifDate || "")) {
      const areas = {};
      for (const [k, c] of Object.entries(CARD_AREAS)) {
        const b = bandOf(at(row, c));
        if (b) areas[k] = b;
      }
      if (!Object.keys(areas).length) continue; // a "full" date but no graded areas — skip
      const sg = clean(at(row, "Safeguarding standards")).toLowerCase();
      const concern = clean(at(row, "Category of concern")) || undefined;
      out[urn] = {
        date: fullDate,
        name,
        card: {
          areas,
          safeguarding: sg === "met" ? "met" : sg === "not met" ? "not met" : undefined,
          concern,
        },
      };
      reportCard++;
    } else if (oeifDate) {
      const rating = overallGrade(at(row, "Latest OEIF overall effectiveness"));
      const sub = {};
      for (const [k, c] of Object.entries(OEIF_SUB)) {
        const g = overallGrade(at(row, c));
        if (g) sub[k] = g;
      }
      out[urn] = {
        date: oeifDate,
        name,
        rating, // undefined when "Not judged" (Sept 2024+)
        sub: Object.keys(sub).length ? sub : undefined,
      };
      if (rating) graded++; else notJudged++;
    }
    // else: no graded/report-card inspection on record — omit.
  }

  // Preserve historical grades the upstream source has dropped: the current MI's three-block format
  // omits pre-2019 (section-5) grades, so we start from the existing committed file and overlay the
  // freshly-built current grades — current ALWAYS wins. Re-inspected schools get up-to-date data;
  // un-re-inspected ones keep their last official grade (the app flags it as "ageing"). The committed
  // ofsted-by-urn.json is therefore both an output and the historical base on the next run.
  let prev = {};
  try {
    prev = JSON.parse(await readFile(OUT, "utf8"));
  } catch {
    /* first run / no existing file */
  }
  const preserved = Object.keys(prev).filter((u) => !out[u]).length;
  const merged = { ...prev, ...out };
  await writeFile(OUT, JSON.stringify(merged) + "\n");
  console.log(
    `Wrote ${Object.keys(merged).length} Ofsted records → ${OUT}\n` +
      `  fresh from MI: ${Object.keys(out).length} (graded ${graded} · graded-since-Sept-2024 no-overall ${notJudged} · report cards ${reportCard})\n` +
      `  preserved older grades (not in current MI): ${preserved}`,
  );
}

main().catch((e) => {
  console.error("ETL failed:", e.message);
  process.exit(1);
});
