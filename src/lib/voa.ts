// The exact Council Tax band for ONE address, from the VOA "Check your Council Tax band" service.
// That service has no API: it's a stateful form (GET form → session cookie + CSRF token → POST the
// postcode → 303 to a results page → parse the address+band rows). It rate-limits hard (429), so this
// is strictly a single, user-initiated, per-property lookup with graceful failure - callers fall back
// to the LSOA band distribution (council-tax-bands-by-lsoa) when it returns null. See DOCUMENTATION §9.
const BASE = "https://www.tax.service.gov.uk/check-council-tax-band";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";

export async function fetchCouncilTaxBand(
  postcode: string,
  line1: string,
): Promise<{ band: string; address: string } | null> {
  if (!postcode.trim() || !line1.trim()) return null;
  try {
    // 1. GET the form for a session cookie (mdtp) + CSRF token.
    const form = await fetch(`${BASE}/search`, {
      headers: { "User-Agent": UA, Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!form.ok) return null;
    const cookies = (form.headers.getSetCookie?.() ?? [])
      .map((c) => c.split(";")[0])
      .join("; ");
    const csrf = (await form.text()).match(/name="csrfToken" value="([^"]+)"/)?.[1];
    if (!cookies || !csrf) return null;

    // 2. POST the postcode → 303 redirect to the (token-keyed) results page.
    const post = await fetch(`${BASE}/search`, {
      method: "POST",
      headers: {
        "User-Agent": UA,
        Cookie: cookies,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrfToken: csrf, postcode, Search: "" }),
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
    });
    const loc = post.headers.get("location");
    if (!loc) return null;

    // 3. GET the results and parse "Property details for <ADDRESS> (Band X)" out of each row.
    const res = await fetch(loc.startsWith("http") ? loc : `https://www.tax.service.gov.uk${loc}`, {
      headers: { "User-Agent": UA, Cookie: cookies, Accept: "text/html" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const want = buildingToken(line1);
    const rows = [...html.matchAll(/Property details for ([^"]+?) \(Band ([A-I])\)/g)].map((m) => ({
      address: m[1].trim(),
      band: m[2],
    }));
    const hit = rows.find((r) => buildingToken(r.address) === want);
    return hit ?? null;
  } catch {
    return null; // 429 / timeout / parse miss → caller falls back to the LSOA typical band
  }
}

// Leading building identifier of an address line, normalised for matching ("42 Oxney Road" → "42").
function buildingToken(s: string): string {
  const t = s.trim().toUpperCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const num = t.match(/^(\d+[A-Z]?)\b/);
  return num ? num[1] : (t.split(" ")[0] ?? "");
}
