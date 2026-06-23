import { AddressMatch, EpcSummary } from "./types";

// Domestic Energy Performance Certificates for a postcode, from MHCLG's "Get energy performance of
// buildings data" service - the successor to epc.opendatacommunities.org, which was retired in
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

interface EpcAddressRow {
  certificateNumber?: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  addressLine3?: string | null;
  addressLine4?: string | null;
  postTown?: string | null;
  postcode?: string;
  currentEnergyEfficiencyBand?: string;
  registrationDate?: string;
  uprn?: number | string;
}

// Sorts "2" before "10" (house numbers) rather than lexically.
const addressCollator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

// The specific addresses at a postcode, from the EPC register - the free address list behind the
// property picker. Deduped to the latest certificate per UPRN. Returns [] with no key/postcode.
export async function fetchAddresses(postcode: string): Promise<AddressMatch[]> {
  const token = process.env.EPC_API_KEY;
  if (!token || !postcode.trim()) return [];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${EPC_API}?postcode=${encodeURIComponent(postcode)}&size=200`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: ctrl.signal,
      next: { revalidate: 86400 },
    });
    if (res.status === 404) return []; // no certificates lodged for this postcode
    if (!res.ok) throw new Error(`EPC API returned ${res.status}`);
    const json = (await res.json()) as { data?: EpcAddressRow[] };
    const rows = Array.isArray(json.data) ? json.data : [];
    // One entry per dwelling: keep the most recently lodged certificate for each UPRN.
    const latest = new Map<string, EpcAddressRow>();
    for (const r of rows) {
      const key = r.uprn != null ? String(r.uprn) : r.certificateNumber;
      if (!key) continue;
      const prev = latest.get(key);
      if (!prev || (r.registrationDate ?? "") > (prev.registrationDate ?? "")) latest.set(key, r);
    }
    return [...latest.values()]
      .map((r): AddressMatch => {
        const parts = [r.addressLine1, r.addressLine2, r.addressLine3, r.addressLine4]
          .map((x) => (x ?? "").trim())
          .filter(Boolean);
        const b = (r.currentEnergyEfficiencyBand ?? "").toUpperCase();
        return {
          uprn: String(r.uprn ?? r.certificateNumber ?? ""),
          certificateNumber: r.certificateNumber,
          line1: parts[0] ?? "",
          address: [...parts, r.postTown, r.postcode].filter(Boolean).join(", "),
          postcode: (r.postcode ?? postcode).toUpperCase(),
          epcBand: /^[A-G]$/.test(b) ? b : null,
          epcDate: r.registrationDate,
        };
      })
      .filter((a) => a.line1)
      .sort((a, b) => addressCollator.compare(a.line1, b.line1));
  } finally {
    clearTimeout(timer);
  }
}

// The current EPC band + lodgement date for one dwelling, by UPRN. Keeps the latest certificate.
// Returns null with no key, no match, or on failure.
export async function fetchEpcByUprn(
  uprn: string,
): Promise<{ band: string | null; date?: string; lmk?: string } | null> {
  const token = process.env.EPC_API_KEY;
  if (!token || !uprn.trim()) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(`${EPC_API}?uprn=${encodeURIComponent(uprn)}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: ctrl.signal,
      next: { revalidate: 86400 },
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`EPC API returned ${res.status}`);
    const json = (await res.json()) as { data?: EpcAddressRow[] };
    const rows = Array.isArray(json.data) ? json.data : [];
    if (!rows.length) return null;
    const latest = rows.reduce((a, b) => ((b.registrationDate ?? "") > (a.registrationDate ?? "") ? b : a));
    const b = (latest.currentEnergyEfficiencyBand ?? "").toUpperCase();
    return {
      band: /^[A-G]$/.test(b) ? b : null,
      date: latest.registrationDate,
      lmk: latest.certificateNumber,
    };
  } finally {
    clearTimeout(timer);
  }
}
