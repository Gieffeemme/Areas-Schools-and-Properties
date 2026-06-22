import { readFileSync } from "node:fs";
import { join } from "node:path";
import { distanceMiles } from "./distance";
import { School, OfstedRating, LatLng, ParentView, SchoolMatch } from "./types";
import { ofstedReportUrl, ofstedEarlyYearsUrl } from "./links";

// The committed datasets in src/data are read from disk at runtime instead of being `import`-bundled,
// so `next build`'s type-checker never has to infer literal types for ~26 MB of JSON — that inference
// OOM-hung Vercel's 8 GB build machine. next.config.ts → outputFileTracingIncludes copies these files
// into each serverless function's trace (the read path is dynamic, so @vercel/nft can't find them on
// its own). Each dataset is parsed once per cold start and memoised.
const DATA_DIR = join(process.cwd(), "src", "data");
function loadData<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), "utf8")) as T;
}
function memo<T>(load: () => T): () => T {
  let value: T;
  let loaded = false;
  return () => {
    if (!loaded) {
      value = load();
      loaded = true;
    }
    return value;
  };
}

interface OfstedRecord {
  rating: OfstedRating;
  date?: string;
  name?: string;
  report?: string;
  sub?: {
    education?: OfstedRating;
    behaviour?: OfstedRating;
    personal?: OfstedRating;
    leadership?: OfstedRating;
    eyfs?: OfstedRating;
    sixthForm?: OfstedRating;
  };
}

const ofstedMap = memo(() => loadData<Record<string, OfstedRecord>>("ofsted-by-urn.json"));

/** True once the ETL has populated src/data/ofsted-by-urn.json. */
export function ofstedLoaded(): boolean {
  return Object.keys(ofstedMap()).length > 0;
}

interface Ks4Record {
  p8: number | null; // Progress 8 (P8MEA)
  att8: number | null; // Attainment 8 (ATT8SCR)
  em5?: number | null; // % grade 5+ in English & Maths (PTL2BASICS_95)
  em4?: number | null; // % grade 4+ in English & Maths (PTL2BASICS_94)
  ebaccEntry?: number | null;
  ebacc94?: number | null;
  disP8?: number | null;
  year: string;
}

const ks4Map = memo(() => loadData<Record<string, Ks4Record>>("ks4-by-urn.json"));

interface Ks5Record {
  grade: string | null; // average result per A level entry, as a grade
  aps: number | null; // average point score per A level entry
  aabFac: number | null; // % AAB+ incl. >=2 facilitating subjects
  pupils: number | null;
  year: string;
}

const ks5Map = memo(() => loadData<Record<string, Ks5Record>>("ks5-by-urn.json"));

interface PvRecord {
  happy: number; // % who agree "My child is happy at this school" (= q["1"].pos)
  responses?: number;
  q?: ParentView; // full survey breakdown
}

const pvMap = memo(() => loadData<Record<string, PvRecord>>("parentview-by-urn.json"));

interface Ks2Record {
  rwmExp: number | null;
  rwmHigh: number | null;
  readProg: number | null;
  writProg: number | null;
  matProg: number | null;
  year: string;
}

const ks2Map = memo(() => loadData<Record<string, Ks2Record>>("ks2-by-urn.json"));

interface CensusRecord {
  fsm: number | null;
  eal: number | null;
  senEhcp: number | null;
  senSupport: number | null;
}
const censusMap = memo(() => loadData<Record<string, CensusRecord>>("census-by-urn.json"));

interface DestRecord {
  ks4?: {
    sustained: number | null;
    education: number | null;
    appren: number | null;
    employment: number | null;
    notSustained: number | null;
  };
  ks5?: {
    sustained: number | null;
    he: number | null;
    fe: number | null;
    appren: number | null;
    employment: number | null;
  };
}
const destMap = memo(() => loadData<Record<string, DestRecord>>("destinations-by-urn.json"));

interface WorkforceRecord {
  ptr: number | null; // pupils per (qualified) teacher, FTE
  teachersFte: number | null; // teaching staff, full-time equivalent
  staffFte: number | null; // all staff (teachers + support), full-time equivalent
  year: string;
}
const workforceMap = memo(() => loadData<Record<string, WorkforceRecord>>("workforce-by-urn.json"));

interface FinanceRecord {
  perPupil: number | null; // total expenditure per pupil (£)
  reserve: number | null; // revenue reserve (£); negative = deficit
  inYear: number | null; // in-year balance (£)
  year: string;
}
const financeMap = memo(() => loadData<Record<string, FinanceRecord>>("finance-by-urn.json"));

// Ofsted Early Years register (postcode-geocoded by the nurseries ETL). Authoritative, England-wide.
interface NurseryRecord {
  urn: string;
  name: string;
  postcode: string;
  rating?: OfstedRating;
  date?: string;
  places?: number;
  sub?: NonNullable<School["ofstedSub"]>;
  lat: number;
  lng: number;
}
const nurseries = memo(() => loadData<NurseryRecord[]>("nurseries.json"));

// GIAS — the DfE register of every school in England (build-gias.mjs, postcode-geocoded). The
// authoritative source of school pins + phase, replacing OpenStreetMap (which missed schools and
// guessed phase). URN is native, so every school joins to the enrichment data above.
interface GiasRecord {
  urn: string;
  name: string;
  postcode: string;
  phase: string;
  lat: number;
  lng: number;
  pupils?: number;
  gender?: string;
  type?: string;
  religion?: string;
  ageLow?: number;
  ageHigh?: number;
  admissions?: string; // "Selective" | "Non-selective" (secondaries only)
}
const gias = memo(() => loadData<GiasRecord[]>("gias.json"));
// State nursery schools appear in GIAS too; dedupe them against the EY register by postcode so a
// setting in both isn't listed twice (GIAS wins — it carries a school-framework Ofsted grade).
const giasNurseryPostcodes = memo(
  () => new Set(gias().filter((g) => g.phase === "Nursery").map((g) => g.postcode)),
);

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Schools within `radiusMiles` of a point, from the GIAS register (enriched by URN with Ofsted,
 * KS2/KS4/KS5, Parent View, census and destinations), plus nurseries from the Ofsted Early Years
 * register. Both are committed, geocoded datasets — no live API call.
 */
export async function fetchSchools(
  centre: LatLng,
  radiusMiles: number,
): Promise<School[]> {
  const schools: School[] = [];

  for (const g of gias()) {
    const d = distanceMiles(centre.lat, centre.lng, g.lat, g.lng);
    if (d > radiusMiles) continue;
    const urn = g.urn;
    const enr = ofstedMap()[urn];
    const ks4 = ks4Map()[urn];
    const ks5 = ks5Map()[urn];
    const pv = pvMap()[urn];
    const ks2 = ks2Map()[urn];
    const census = censusMap()[urn];
    const dest = destMap()[urn];
    const wf = workforceMap()[urn];
    const fin = financeMap()[urn];
    schools.push({
      id: `gias/${urn}`,
      name: g.name,
      lat: g.lat,
      lng: g.lng,
      distanceMiles: round1(d),
      urn,
      phase: g.phase,
      pupils: g.pupils,
      gender: g.gender,
      type: g.type,
      religion: g.religion,
      ageLow: g.ageLow,
      ageHigh: g.ageHigh,
      selective: g.admissions === "Selective" || undefined,
      ofsted: enr?.rating ?? (ofstedLoaded() ? "Not rated" : "Not loaded"),
      ofstedDate: enr?.date,
      progress8: ks4?.p8 ?? null,
      attainment8: ks4?.att8 ?? null,
      gcse5EM: ks4?.em5 ?? null,
      gcse4EM: ks4?.em4 ?? null,
      ks4Year: ks4?.year,
      ebaccEntry: ks4?.ebaccEntry ?? null,
      ebacc94: ks4?.ebacc94 ?? null,
      disadvantagedP8: ks4?.disP8 ?? null,
      alevel: ks5 ?? null,
      parentViewHappy: pv?.happy ?? null,
      parentViewResponses: pv?.responses,
      parentView: pv?.q ?? null,
      ofstedReport: enr?.report ?? ofstedReportUrl(urn),
      ofstedSub: enr?.sub,
      ks2: ks2 ?? null,
      composition: census,
      destinations: dest,
      pupilTeacherRatio: wf?.ptr ?? null,
      teachersFte: wf?.teachersFte ?? null,
      staffFte: wf?.staffFte ?? null,
      workforceYear: wf?.year,
      financePerPupil: fin?.perPupil ?? null,
      financeReserve: fin?.reserve ?? null,
      financeInYear: fin?.inYear ?? null,
      financeYear: fin?.year,
    });
  }

  // Nurseries from the Ofsted Early Years register (~23k). Skip any that are also a GIAS state
  // nursery school at the same postcode (already added above).
  for (const n of nurseries()) {
    if (giasNurseryPostcodes().has(n.postcode)) continue;
    const d = distanceMiles(centre.lat, centre.lng, n.lat, n.lng);
    if (d > radiusMiles) continue;
    schools.push({
      id: `ey/${n.urn}`,
      name: n.name,
      lat: n.lat,
      lng: n.lng,
      distanceMiles: round1(d),
      phase: "Nursery",
      ofsted: n.rating ?? "Not rated",
      ofstedDate: n.date,
      ofstedSub: n.sub,
      // EY register deep-links to the live provider page (type 16), which carries the new
      // report-card grade the bulk MI hasn't published yet — so a re-inspection shows there.
      ofstedReport: ofstedEarlyYearsUrl(n.urn),
      places: n.places,
    });
  }

  schools.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return schools;
}

/**
 * Search schools + nurseries by name (for the search box). Matches are ranked: exact, then prefix,
 * then "The "-prefixed, then any substring; ties broken by shorter name (closer match).
 */
export function searchSchools(query: string, limit = 8): SchoolMatch[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const scored: { score: number; m: SchoolMatch }[] = [];
  const rank = (name: string) => {
    const lc = name.toLowerCase();
    const i = lc.indexOf(q);
    if (i < 0) return -1;
    if (lc === q) return 0;
    if (i === 0) return 1;
    if (lc.startsWith("the " + q)) return 2;
    return 3;
  };
  for (const g of gias()) {
    const score = rank(g.name);
    if (score < 0) continue;
    scored.push({ score, m: { id: `gias/${g.urn}`, name: g.name, phase: g.phase, postcode: g.postcode, lat: g.lat, lng: g.lng } });
  }
  for (const nrec of nurseries()) {
    const score = rank(nrec.name);
    if (score < 0) continue;
    scored.push({ score, m: { id: `ey/${nrec.urn}`, name: nrec.name, phase: "Nursery", postcode: nrec.postcode, lat: nrec.lat, lng: nrec.lng } });
  }
  scored.sort((a, b) => a.score - b.score || a.m.name.length - b.m.name.length);
  return scored.slice(0, limit).map((s) => s.m);
}
