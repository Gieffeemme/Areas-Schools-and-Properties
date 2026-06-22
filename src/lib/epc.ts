import { EpcSummary } from "./types";

// Domestic Energy Performance Certificates for a postcode, from MHCLG's "Get energy performance of
// buildings data" service — the successor to epc.opendatacommunities.org, which was retired in
// May 2026. Live query; the Bearer token (EPC_API_KEY) is server-only and never reaches the browser.
// Returns null when no key is configured or the call fails; an empty summary (count 0) when the
// postcode simply has no certificates.
const EPC_API =
  "https://api.get-energy-performance-data.communities.gov.uk/api/domestic/search";

interface EpcRow {
  uprn?: number | string;
  certificateNumber?: string;
  currentEnergyEfficiencyBand?: string;
  registrationDate?: string;
}

export async function fetchEpc(postcode: string): Promise<EpcSummary | null> {
  const token = process.env.EPC_API_KEY;
  if (!token || !postcode.trim()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${EPC_API}?postcode=${encodeURIComponent(postcode)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: ctrl.signal,
      next: { revalidate: 86400 },
    });
    if (res.status === 404) return { postcode, count: 0, bands: {}, typicalBand: null }; // no certs here
    if (!res.ok) throw new Error(`EPC API returned ${res.status}`);
    const json = (await res.json()) as { data?: EpcRow[] };
    const rows = Array.isArray(json.data) ? json.data : [];
    // Keep the latest certificate per dwelling (uprn) so re-lodgements don't double-count the mix.
    const latest = new Map<string, EpcRow>();
    rows.forEach((r, i) => {
      const key = String(r.uprn ?? r.certificateNumber ?? `_${i}`);
      const prev = latest.get(key);
      if (!prev || (r.registrationDate ?? "") > (prev.registrationDate ?? "")) latest.set(key, r);
    });
    const bands: Record<string, number> = {};
    for (const r of latest.values()) {
      const b = (r.currentEnergyEfficiencyBand ?? "").toUpperCase();
      if (/^[A-G]$/.test(b)) bands[b] = (bands[b] ?? 0) + 1;
    }
    const count = Object.values(bands).reduce((a, b) => a + b, 0);
    const typicalBand =
      Object.entries(bands).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
    return { postcode, count, bands, typicalBand };
  } finally {
    clearTimeout(timer);
  }
}
