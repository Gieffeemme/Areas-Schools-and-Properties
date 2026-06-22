import { PriceSale, PriceSummary, PriceYear } from "./types";

const LR = "http://landregistry.data.gov.uk/data/ppi/transaction-record.json";
const SPARQL = "http://landregistry.data.gov.uk/landregistry/query";

// The Price Paid linked-data API only matches an EXACT postcode, which is blank for most postcodes.
// When that's sparse we widen to the postcode sector (e.g. "SW2 1") via the SPARQL endpoint's
// STRSTARTS filter - still HM Land Registry, just a usable amount of history.
const MIN_EXACT = 6;
const SECTOR_LIMIT = 250;

/** Recent HM Land Registry Price Paid sales for a postcode, widening to its sector when sparse. */
export async function fetchPrices(postcode: string): Promise<PriceSummary> {
  const exact = await fetchExact(postcode);
  if (exact.length >= MIN_EXACT) return summarise(postcode, postcode, "postcode", exact);

  const sector = sectorOf(postcode);
  if (sector) {
    const wide = await fetchSector(sector).catch(() => [] as PriceSale[]);
    if (wide.length > exact.length) return summarise(postcode, sector, "sector", wide);
  }
  return summarise(postcode, postcode, "postcode", exact);
}

/** Exact-postcode sales from the Price Paid linked-data API. */
async function fetchExact(postcode: string): Promise<PriceSale[]> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const url =
      `${LR}?propertyAddress.postcode=${encodeURIComponent(postcode)}` +
      `&_pageSize=120&_sort=-transactionDate`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`Land Registry returned ${res.status}`);
    const data = await res.json();
    const items = (data?.result?.items ?? []) as Record<string, unknown>[];
    return items
      .map((it): PriceSale => {
        const addr = (it.propertyAddress ?? {}) as Record<string, unknown>;
        return {
          date: toIso(it.transactionDate),
          price: Number(it.pricePaid) || 0,
          paon: asString(addr.paon),
          street: asString(addr.street),
          type: propertyType(it.propertyType),
        };
      })
      .filter((s) => s.price > 0)
      .sort(byDateDesc);
  } finally {
    clearTimeout(timer);
  }
}

/** Sector-wide sales (e.g. "SW2 1") via the Land Registry SPARQL endpoint's STRSTARTS filter. */
async function fetchSector(sector: string): Promise<PriceSale[]> {
  const query = `
PREFIX lrppi: <http://landregistry.data.gov.uk/def/ppi/>
PREFIX lrcommon: <http://landregistry.data.gov.uk/def/common/>
SELECT ?date ?amount ?type ?paon ?street WHERE {
  ?t lrppi:pricePaid ?amount ;
     lrppi:transactionDate ?date ;
     lrppi:propertyAddress ?a .
  ?a lrcommon:postcode ?postcode .
  OPTIONAL { ?t lrppi:propertyType ?type }
  OPTIONAL { ?a lrcommon:paon ?paon }
  OPTIONAL { ?a lrcommon:street ?street }
  FILTER(STRSTARTS(?postcode, "${sector}"))
} ORDER BY DESC(?date) LIMIT ${SECTOR_LIMIT}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(SPARQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/sparql-results+json",
      },
      body: "query=" + encodeURIComponent(query),
      signal: ctrl.signal,
      next: { revalidate: 86400 },
    });
    if (!res.ok) throw new Error(`Land Registry SPARQL returned ${res.status}`);
    const json = await res.json();
    const rows = (json?.results?.bindings ?? []) as Record<string, { value?: string }>[];
    return rows
      .map((r): PriceSale => ({
        date: toIso(r.date?.value),
        price: Number(r.amount?.value) || 0,
        paon: r.paon?.value,
        street: r.street?.value,
        type: propertyType(r.type?.value),
      }))
      .filter((s) => s.price > 0)
      .sort(byDateDesc);
  } finally {
    clearTimeout(timer);
  }
}

function summarise(
  postcode: string,
  area: string,
  scope: "postcode" | "sector",
  sales: PriceSale[],
): PriceSummary {
  const count = sales.length;
  const averagePrice = count
    ? Math.round(sales.reduce((sum, s) => sum + s.price, 0) / count)
    : null;
  const medianPrice = median(sales.map((s) => s.price));

  // Bucket prices by year so the trend can use an outlier-robust median per year.
  const yearMap = new Map<number, number[]>();
  for (const s of sales) {
    const y = Number(s.date.slice(0, 4));
    if (!y) continue;
    const list = yearMap.get(y);
    if (list) list.push(s.price);
    else yearMap.set(y, [s.price]);
  }
  const byYear: PriceYear[] = [...yearMap.entries()]
    .map(([year, ps]) => ({
      year,
      averagePrice: Math.round(ps.reduce((a, b) => a + b, 0) / ps.length),
      medianPrice: median(ps) as number,
      count: ps.length,
    }))
    .sort((a, b) => a.year - b.year);

  return { postcode, scope, area, sales: sales.slice(0, 12), count, averagePrice, medianPrice, byYear };
}

/** Median of a list of numbers (rounded), or null when empty. */
function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** Postcode → sector, e.g. "SW2 1AA" → "SW2 1". Null for anything that isn't a full postcode. */
function sectorOf(postcode: string): string | null {
  const m = postcode.trim().toUpperCase().match(/^(.+?)\s*(\d)[A-Z]{2}$/);
  return m ? `${m[1]} ${m[2]}` : null;
}

const byDateDesc = (a: PriceSale, b: PriceSale) => (a.date < b.date ? 1 : -1);

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// Land Registry serialises dates as RFC-1123 ("Mon, 26 Feb 2024") via the linked-data API and as
// ISO ("2024-02-26") via SPARQL. Normalise both to YYYY-MM-DD using local components (avoids a
// timezone off-by-one from toISOString()).
function toIso(raw: unknown): string {
  if (typeof raw !== "string" || !raw) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Land Registry encodes property type as a URI (…/common/detached) or {_about}. */
function propertyType(v: unknown): string | undefined {
  let uri: string | undefined;
  if (typeof v === "string") uri = v;
  else if (v && typeof v === "object" && "_about" in v) {
    uri = (v as { _about?: string })._about;
  }
  if (!uri) return undefined;
  const slug = uri.split("/").pop()?.split("#").pop();
  if (!slug) return undefined;
  return slug.replace(/-/g, " ");
}
