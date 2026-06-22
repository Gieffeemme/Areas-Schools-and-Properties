import { CrimeSummary, LatLng } from "./types";

// police.uk's crimes-street endpoint returns crimes within a fixed ~1-mile radius of the
// point, so we benchmark against that area regardless of the map's school radius.
const POLICE_RADIUS_MILES = 1;

// "Relative to average" benchmark. We compare the monthly incident count to an indicative
// figure for a TYPICAL UK populated area of this size (~120 incidents/month). This is an
// approximate, population-aware benchmark: a flat geographic average (all land, incl. empty
// countryside) would make every town read 10×+ and be useless for comparing places people
// actually live. Flagged approximate in the UI.
const TYPICAL_AREA_MONTHLY_CRIMES = 120;

interface RawCrime {
  category: string;
  month: string;
}

async function fetchCrimesAt(centre: LatLng, date?: string): Promise<RawCrime[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const url =
      `https://data.police.uk/api/crimes-street/all-crime?lat=${centre.lat}&lng=${centre.lng}` +
      (date ? `&date=${date}` : "");
    const res = await fetch(url, { signal: ctrl.signal, next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`police.uk returned ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : []) as RawCrime[];
  } finally {
    clearTimeout(timer);
  }
}

// Recent "YYYY-MM" months, newest first, starting `skip` months back (police.uk lags ~2 months).
function recentMonths(count: number, skip = 2): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - skip);
  for (let i = 0; i < count; i++) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export async function fetchCrime(centre: LatLng): Promise<CrimeSummary> {
  // Common case: the latest month police.uk publishes globally.
  let crimes = await fetchCrimesAt(centre);

  // Some forces lag that global latest month and return empty - fall back across recent
  // months and take the newest one that actually has data.
  if (crimes.length === 0) {
    const results = await Promise.all(recentMonths(4).map((m) => fetchCrimesAt(centre, m)));
    for (const r of results) {
      if (r.length > 0) {
        crimes = r;
        break;
      }
    }
  }

  const counts = new Map<string, number>();
  let month = "";
  for (const c of crimes) {
    counts.set(c.category, (counts.get(c.category) ?? 0) + 1);
    if (c.month) month = c.month;
  }

  const byCategory = [...counts.entries()]
    .map(([category, count]) => ({ category: prettyCategory(category), count }))
    .sort((a, b) => b.count - a.count);

  const total = crimes.length;
  return {
    month,
    total,
    byCategory,
    nationalBaseline: TYPICAL_AREA_MONTHLY_CRIMES,
    ratioToNational: Math.round((total / TYPICAL_AREA_MONTHLY_CRIMES) * 10) / 10,
    radiusMiles: POLICE_RADIUS_MILES,
  };
}

function prettyCategory(slug: string): string {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
