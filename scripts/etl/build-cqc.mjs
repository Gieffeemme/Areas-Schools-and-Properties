#!/usr/bin/env node
/**
 * Build src/data/cqc-locations.json — every active CQC-regulated health/care LOCATION in England that a
 * resident would care about (GP practices, dentists, care homes, hospitals, home-care agencies), with its
 * latest CQC overall rating, the rating's publication date, postcode and coordinates. Read at runtime by
 * src/lib/cqc.ts as a committed-dataset radius lookup (like amenities/stations) — no per-request API call.
 *
 * Source: CQC's "Care directory with filters" — the HSCA_Active_Locations ODS on the transparency page.
 * It's a free, no-key, Open Government Licence bulk download that already carries the Latest Overall
 * Rating, Publication Date, Postcode AND Location Latitude/Longitude in one sheet — so we don't need the
 * gated Syndication API (which has no radius search anyway; ratings live only in its per-location detail
 * endpoint). The CQC profile page for a record is the deterministic https://www.cqc.org.uk/location/{id}.
 *   https://www.cqc.org.uk/about-us/transparency/using-cqc-data
 *
 * The project's `xlsx` can't read these CQC ODS files reliably, so we parse the ODS content.xml directly
 * (it's a zip of XML), exactly like build-council-tax-cost.mjs. Needs `unzip` on PATH.
 *   npm run etl:cqc                                  # discover + download the latest file off the page
 *   npm run etl:cqc -- /path/HSCA_Active_Locations.ods  # parse a local file (skips the download)
 */
import { writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "cqc-locations.json");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const TRANSPARENCY = "https://www.cqc.org.uk/about-us/transparency/using-cqc-data";
const SHEET = "HSCA_Active_Locations";

// Map CQC's "Primary Inspection Category" → our display category. Anything unmapped (ambulance, prison
// healthcare, independent consulting doctors, lone mental-health/community-health sites, …) is dropped:
// low signal for "health & care near a home", and it keeps the committed file lean.
function category(primary) {
  const p = (primary || "").toLowerCase();
  if (p.includes("gp practice")) return "gp";
  if (p.includes("dentist")) return "dentist";
  if (p.includes("residential social care")) return "care_home";
  if (p.startsWith("acute hospital")) return "hospital";
  if (p.includes("community based adult social care")) return "home_care";
  return null;
}

// ODS text cells are XML-escaped (e.g. "Mary &amp; Joseph House"); decode the common entities so names
// read naturally. Numeric character refs too, for the occasional &#39; etc.
function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // last, so a literal "&amp;amp;" isn't double-decoded
}

// One named <table:table> block from an ODS content.xml (the file has README / HSCA_Active_Locations /
// Dual_Registration_Locations tabs; HSCA comes first, so slice to the first closing tag after it).
function tableBlock(xml, name) {
  const at = xml.indexOf(`table:name="${name}"`);
  if (at < 0) return "";
  return xml.slice(xml.lastIndexOf("<table:table ", at), xml.indexOf("</table:table>", at));
}

// Parse ODS rows → string cells, expanding number-columns-repeated and preferring office:value (so date
// and lat/long cells come through as their machine value, not the display text).
function parseRows(block) {
  const rows = [];
  for (const rm of block.matchAll(/<table:table-row[^>]*>([\s\S]*?)<\/table:table-row>/g)) {
    const cells = [];
    const rx =
      /<table:(?:covered-table-cell|table-cell)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/table:(?:covered-table-cell|table-cell)>)/g;
    let m;
    while ((m = rx.exec(rm[1]))) {
      const attrs = m[1] || "";
      // Cap the repeat: real data is ~40 columns; a big trailing repeat just pads empties past our indices.
      const rep = Math.min(parseInt(attrs.match(/number-columns-repeated="(\d+)"/)?.[1] ?? "1", 10), 200);
      const val = attrs.match(/office:value="([^"]*)"/)?.[1];
      const text = decodeEntities((m[2] || "").replace(/<[^>]+>/g, "")).trim();
      const cell = (val ?? text ?? "").trim();
      for (let i = 0; i < rep; i++) cells.push(cell);
    }
    rows.push(cells);
  }
  return rows;
}

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

// Dates arrive as office:value ISO ("2022-04-20"), display text ("20/04/2022"), or textual
// ("01 June 2026", from the README snapshot line); → ISO "YYYY-MM-DD".
function toIso(s) {
  const v = (s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  const slash = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slash) return `${slash[3]}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
  const text = v.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (text) {
    const mo = MONTHS.indexOf(text[2].toLowerCase());
    if (mo >= 0) return `${text[3]}-${String(mo + 1).padStart(2, "0")}-${text[1].padStart(2, "0")}`;
  }
  return null;
}

async function loadOds(arg) {
  if (arg && arg.endsWith(".ods")) return arg;
  console.log("Finding the HSCA Active Locations ODS on the CQC transparency page…");
  const page = await fetch(TRANSPARENCY, { headers: { "User-Agent": UA } });
  if (!page.ok) throw new Error(`transparency page returned ${page.status}`);
  const url = (await page.text()).match(/https:\/\/[^"']*HSCA_Active_Locations\.ods/)?.[0];
  if (!url) throw new Error("HSCA_Active_Locations.ods link not found on the transparency page");
  console.log("Downloading", url);
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const odsPath = join(tmpdir(), "cqc-active-locations.ods");
  await writeFile(odsPath, Buffer.from(await res.arrayBuffer()));
  return odsPath;
}

async function main() {
  const odsPath = await loadOds(process.argv[2]);
  const dir = join(tmpdir(), "cqc-x");
  execSync(`rm -rf ${dir} && unzip -o ${odsPath} content.xml -d ${dir}`, { stdio: "ignore" });
  const xml = readFileSync(join(dir, "content.xml"), "utf8");

  // Best-effort snapshot date for attribution ("…as at 01 June 2026"). The phrase lives in the small
  // README tab; strip its tags (the date may be wrapped in a <text:span>) before matching, then fall
  // back to the filename ("01_June_2026_…").
  const readme = tableBlock(xml, "README").replace(/<[^>]+>/g, " ");
  const asAt =
    toIso((readme.match(/as at\s+(\d{1,2}\s+[A-Za-z]+\s+\d{4})/)?.[1] ?? "").replace(/\s+/g, " ")) ??
    dateFromName(odsPath);

  const rows = parseRows(tableBlock(xml, SHEET));
  const hdr = rows.find((r) => r[0] === "Location ID");
  if (!hdr) throw new Error(`${SHEET}: header row (Location ID …) not found`);
  const col = (name) => {
    const i = hdr.indexOf(name);
    if (i < 0) throw new Error(`${SHEET}: column "${name}" not found`);
    return i;
  };
  const iId = col("Location ID");
  const iName = col("Location Name");
  const iCat = col("Location Primary Inspection Category");
  const iRating = col("Location Latest Overall Rating");
  const iDate = col("Publication Date");
  const iPc = col("Location Postal Code");
  const iLat = col("Location Latitude");
  const iLng = col("Location Longitude");

  const locations = [];
  let dropped = 0;
  let noCoord = 0;
  for (const r of rows) {
    const id = (r[iId] || "").trim();
    if (!/^\d-\d+$/.test(id)) continue; // skip the header + any non-data rows
    const cat = category(r[iCat]);
    if (!cat) {
      dropped++;
      continue;
    }
    const lat = parseFloat(r[iLat]);
    const lng = parseFloat(r[iLng]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      noCoord++;
      continue; // can't place it on the map → no use to a radius lookup
    }
    locations.push({
      id,
      name: (r[iName] || "").trim(),
      cat,
      rating: (r[iRating] || "").trim(), // raw CQC rating; normalised at runtime (src/lib/ratings.ts)
      date: toIso(r[iDate]),
      pc: (r[iPc] || "").trim(),
      lat: Math.round(lat * 1e5) / 1e5,
      lng: Math.round(lng * 1e5) / 1e5,
    });
  }

  if (locations.length < 40000)
    throw new Error(`only ${locations.length} locations — looks truncated, refusing to write`);

  const byCat = {};
  const byRating = {};
  for (const l of locations) {
    byCat[l.cat] = (byCat[l.cat] ?? 0) + 1;
    const k = l.rating || "(unrated)";
    byRating[k] = (byRating[k] ?? 0) + 1;
  }

  await writeFile(OUT, JSON.stringify({ asAt, count: locations.length, locations }) + "\n");
  console.log(`Wrote ${locations.length} CQC locations (as at ${asAt ?? "unknown"}) → ${OUT}`);
  console.log(`  dropped (other categories): ${dropped} · skipped (no coords): ${noCoord}`);
  console.log("  by category:", JSON.stringify(byCat));
  console.log("  by rating:", JSON.stringify(byRating));
}

// Fallback snapshot date from a filename like "01_June_2026_HSCA_Active_Locations.ods".
function dateFromName(path) {
  const m = path.match(/(\d{1,2})_([A-Za-z]+)_(\d{4})/);
  if (!m) return null;
  const month = MONTHS.indexOf(m[2].toLowerCase());
  if (month < 0) return null;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

main().catch((e) => {
  console.error("cqc ETL failed:", e.message);
  process.exit(1);
});
