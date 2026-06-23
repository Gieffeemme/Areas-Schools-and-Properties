import { CensusSummary } from "./types";

// Census 2021 area demographics ("who lives here") from the ONS via the Nomis API (no key). England &
// Wales only (Scotland=NRS, NI=NISRA are separate). Keyed by the 2021 LSOA, which postcodes.io returns
// as codes.lsoa21 - so a postcode maps straight onto the census geography with no 2011->2021 lookup.
// Census 2021 is static, so each table is cached hard (30 days). Runtime fetch like flood/noise; could
// later move to a committed dataset (the amenities/stations route) if the per-report calls ever matter.
const NOMIS = "https://www.nomisweb.co.uk/api/v01/dataset";
const UA = "area-intel/1.0 (https://areas-schools-and-properties.vercel.app)";

// Nomis dataset ids for the Census 2021 "TS" topic-summary tables we surface.
const TABLES = {
  age: "NM_2020_1", // TS007A - age by 5-year bands
  tenure: "NM_2072_1", // TS054 - tenure
  economic: "NM_2083_1", // TS066 - economic activity status
  quals: "NM_2084_1", // TS067 - highest qualification
  household: "NM_2023_1", // TS003 - household composition
} as const;

type Table = { pct: Map<string, number>; count: Map<string, number> };

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const round1 = (n: number) => Math.round(n * 10) / 10;
const val = <T>(r: PromiseSettledResult<T>) => (r.status === "fulfilled" ? r.value : null);
const findTotal = (m: Map<string, number>): number | null => {
  for (const [k, v] of m) if (/^total/i.test(k)) return v;
  return null;
};

interface Obs {
  measures?: { value?: number }; // 20100 = count, 20301 = percent
  obs_value?: { value?: number | string }; // Nomis mixes string + number values, so coerce
  [k: string]: unknown;
}

// One Census table for one geography -> {category description -> percent} and {-> count}.
async function table(id: string, geo: string): Promise<Table> {
  const res = await fetch(`${NOMIS}/${id}.data.json?geography=${geo}&measures=20100,20301`, {
    headers: { "User-Agent": UA },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!res.ok) throw new Error(`Nomis ${id} returned ${res.status}`);
  const data = (await res.json()) as { obs?: Obs[] };
  const pct = new Map<string, number>();
  const count = new Map<string, number>();
  for (const o of data.obs ?? []) {
    let desc = "";
    for (const k of Object.keys(o)) {
      if (k.startsWith("c2021") || k === "cell") {
        desc = norm((o[k] as { description?: string }).description ?? "");
      }
    }
    const measure = o.measures?.value;
    const v = Number(o.obs_value?.value); // Nomis returns some values as strings, others as numbers
    if (!desc || !Number.isFinite(v)) continue;
    if (measure === 20301) pct.set(desc, v);
    else if (measure === 20100) count.set(desc, v);
  }
  return { pct, count };
}

export async function fetchCensus(lsoa21?: string): Promise<CensusSummary | null> {
  // Census 2021 covers England & Wales; their 2021 LSOA codes are E01.../W01...
  if (!lsoa21 || !/^[EW]01/.test(lsoa21)) return null;
  const [ageR, tenureR, ecoR, qualR, hhR] = await Promise.allSettled([
    table(TABLES.age, lsoa21),
    table(TABLES.tenure, lsoa21),
    table(TABLES.economic, lsoa21),
    table(TABLES.quals, lsoa21),
    table(TABLES.household, lsoa21),
  ]);
  const ageT = val(ageR);
  const tenureT = val(tenureR);
  const ecoT = val(ecoR);
  const qualT = val(qualR);
  const hhT = val(hhR);
  if (!ageT && !tenureT && !ecoT && !qualT && !hhT) return null;
  return {
    population: ageT ? findTotal(ageT.count) : null,
    households: tenureT ? findTotal(tenureT.count) : null,
    age: ageT ? parseAge(ageT) : null,
    tenure: tenureT ? parseTenure(tenureT) : null,
    economic: ecoT ? parseEconomic(ecoT) : null,
    qualifications: qualT ? parseQuals(qualT) : null,
    household: hhT ? parseHousehold(hhT) : null,
  };
}

// 5-year age bands (in ascending order, Total dropped) -> headline split + median (interpolated).
function parseAge(t: Table): CensusSummary["age"] {
  const raw: number[] = [];
  for (const [desc, pct] of t.pct) {
    if (/^total/i.test(desc)) continue;
    raw.push(pct);
  }
  if (!raw.length) return null;
  const bands = raw.map((pct, i) => ({
    label: i < raw.length - 1 ? `${i * 5}-${i * 5 + 4}` : `${i * 5}+`,
    pct: round1(pct),
  }));
  let cum = 0;
  let median: number | null = null;
  for (let i = 0; i < raw.length; i++) {
    const prev = cum;
    cum += raw[i];
    if (median === null && cum >= 50 && raw[i] > 0) median = Math.round(i * 5 + ((50 - prev) / raw[i]) * 5);
  }
  const under15 = round1(raw.slice(0, 3).reduce((a, b) => a + b, 0)); // 0-14
  const over65 = round1(raw.slice(13).reduce((a, b) => a + b, 0)); // 65+
  return { median, under15, working: round1(Math.max(0, 100 - under15 - over65)), over65, bands };
}

function parseTenure(t: Table): CensusSummary["tenure"] {
  const g = (d: string) => t.pct.get(norm(d)) ?? 0;
  const owned = g("Owned");
  const social = g("Social rented");
  const priv = g("Private rented");
  if (!owned && !social && !priv) return null;
  return {
    owned: round1(owned),
    socialRented: round1(social),
    privateRented: round1(priv),
    other: round1(g("Shared ownership") + g("Lives rent free")),
  };
}

// TS066 is a deep nest; sum the top-level "Economically active/inactive" cats (no colon) and the
// direct ":In employment" children.
function parseEconomic(t: Table): CensusSummary["economic"] {
  let active = 0;
  let inactive = 0;
  let inEmp = 0;
  for (const [desc, pct] of t.pct) {
    if (/^total/i.test(desc)) continue;
    if (/^economically active/i.test(desc) && !desc.includes(":")) active += pct;
    else if (/^economically inactive/i.test(desc) && !desc.includes(":")) inactive += pct;
    if (/:\s*in employment$/i.test(desc)) inEmp += pct;
  }
  if (!active && !inactive) return null;
  if (!inactive && active) inactive = 100 - active;
  return { inEmployment: round1(inEmp), active: round1(active), inactive: round1(inactive) };
}

function parseQuals(t: Table): CensusSummary["qualifications"] {
  const l4 = t.pct.get(norm("Level 4 qualifications or above"));
  const none = t.pct.get(norm("No qualifications"));
  if (l4 == null && none == null) return null;
  return { level4plus: round1(l4 ?? 0), none: round1(none ?? 0) };
}

function parseHousehold(t: Table): CensusSummary["household"] {
  const one = t.pct.get(norm("One-person household"));
  const fam = t.pct.get(norm("Single family household"));
  const other = t.pct.get(norm("Other household types"));
  if (one == null && fam == null) return null;
  return { onePerson: round1(one ?? 0), family: round1(fam ?? 0), other: round1(other ?? 0) };
}
