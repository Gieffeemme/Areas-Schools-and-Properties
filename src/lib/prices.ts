import { PriceSale, PriceSummary, PriceYear } from "./types";

const LR = "http://landregistry.data.gov.uk/data/ppi/transaction-record.json";

/** Recent HM Land Registry Price Paid sales for an exact postcode. No API key required. */
export async function fetchPrices(postcode: string): Promise<PriceSummary> {
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
    const items = data?.result?.items ?? [];

    const sales: PriceSale[] = items
      .map((it: Record<string, unknown>) => {
        const addr = (it.propertyAddress ?? {}) as Record<string, unknown>;
        return {
          date: toIso(it.transactionDate),
          price: Number(it.pricePaid) || 0,
          paon: asString(addr.paon),
          street: asString(addr.street),
          type: propertyType(it.propertyType),
        };
      })
      .filter((s: PriceSale) => s.price > 0)
      .sort((a: PriceSale, b: PriceSale) => (a.date < b.date ? 1 : -1));

    const count = sales.length;
    const averagePrice = count
      ? Math.round(sales.reduce((sum, s) => sum + s.price, 0) / count)
      : null;

    const yearMap = new Map<number, { sum: number; n: number }>();
    for (const s of sales) {
      const y = Number(s.date.slice(0, 4));
      if (!y) continue;
      const e = yearMap.get(y) ?? { sum: 0, n: 0 };
      e.sum += s.price;
      e.n += 1;
      yearMap.set(y, e);
    }
    const byYear: PriceYear[] = [...yearMap.entries()]
      .map(([year, e]) => ({
        year,
        averagePrice: Math.round(e.sum / e.n),
        count: e.n,
      }))
      .sort((a, b) => a.year - b.year);

    return { postcode, sales: sales.slice(0, 12), count, averagePrice, byYear };
  } finally {
    clearTimeout(timer);
  }
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

// Land Registry serialises dates as RFC-1123 ("Mon, 26 Feb 2024"). Normalise to YYYY-MM-DD
// using local components (avoids a timezone off-by-one from toISOString()).
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
