// Council Tax data from the VOA "Check your Council Tax band" service. It has no API: it's a stateful
// form (GET form → session cookie + CSRF token → POST the postcode → 303 to a results page → parse the
// address+band rows). It rate-limits hard (429) and only returns ~18 rows (page 1 = lowest house
// numbers; &page=N is broken, no page-size override - see DOCUMENTATION §9), so this is strictly a
// single, user-initiated lookup with graceful failure. Two uses:
//   fetchCouncilTaxBand() - the exact band for one address (per-property report; LSOA fallback)
//   fetchVoaAddresses()   - the postcode's dwelling list (to widen the EPC-only picker; best-effort)
const BASE = "https://www.tax.service.gov.uk/check-council-tax-band";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const PC_RE = /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/i;
const ROW_RE = /Property details for ([^"]+?) \(Band ([A-I])\)/g;

// Drive the form flow and return the results-page HTML, or null on any failure (404/429/timeout).
async function voaResultsHtml(postcode: string): Promise<string | null> {
  // 1. GET the form for a session cookie (mdtp) + CSRF token.
  const form = await fetch(`${BASE}/search`, {
    headers: { "User-Agent": UA, Accept: "text/html" },
    signal: AbortSignal.timeout(8000),
  });
  if (!form.ok) return null;
  const cookies = (form.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const csrf = (await form.text()).match(/name="csrfToken" value="([^"]+)"/)?.[1];
  if (!cookies || !csrf) return null;

  // 2. POST the postcode → 303 to the (token-keyed) results page.
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

  // 3. GET the results.
  const res = await fetch(loc.startsWith("http") ? loc : `https://www.tax.service.gov.uk${loc}`, {
    headers: { "User-Agent": UA, Cookie: cookies, Accept: "text/html" },
    signal: AbortSignal.timeout(8000),
  });
  return res.ok ? res.text() : null;
}

// The exact Council Tax band for ONE address (matched by building number). null → caller falls back
// to the LSOA typical band.
export async function fetchCouncilTaxBand(
  postcode: string,
  line1: string,
): Promise<{ band: string; address: string } | null> {
  if (!postcode.trim() || !line1.trim()) return null;
  try {
    const html = await voaResultsHtml(postcode);
    if (!html) return null;
    const want = buildingToken(line1);
    const hit = [...html.matchAll(ROW_RE)]
      .map((m) => ({ address: m[1].trim(), band: m[2] }))
      .find((r) => buildingToken(r.address) === want);
    return hit ?? null;
  } catch {
    return null; // 429 / timeout / parse miss
  }
}

// Every dwelling the VOA lists for a postcode (page 1, ~18 rows) - the council-tax register covers
// homes the EPC register doesn't. Returns [] on any failure (the picker then falls back to EPC-only).
export async function fetchVoaAddresses(
  postcode: string,
): Promise<{ line1: string; band: string }[]> {
  if (!postcode.trim()) return [];
  try {
    const html = await voaResultsHtml(postcode);
    if (!html) return [];
    return [...html.matchAll(ROW_RE)]
      .map((m) => ({ line1: cleanVoaLine1(m[1].trim()), band: m[2] }))
      .filter((r) => r.line1);
  } catch {
    return [];
  }
}

// VOA addresses are "NUMBER STREET, TOWN, POSTCODE" (caps). Keep the building+street, drop the town +
// postcode, and title-case: "96 GREENVALE ROAD, ELTHAM, SE9 1PF" → "96 Greenvale Road".
function cleanVoaLine1(addr: string): string {
  let parts = addr.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length && PC_RE.test(parts[parts.length - 1])) parts = parts.slice(0, -1); // drop postcode
  if (parts.length > 1) parts = parts.slice(0, -1); // drop post town
  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

// Leading building identifier of an address line, normalised for matching ("42 Oxney Road" → "42").
function buildingToken(s: string): string {
  const t = s.trim().toUpperCase().replace(/,/g, " ").replace(/\s+/g, " ").trim();
  const num = t.match(/^(\d+[A-Z]?)\b/);
  return num ? num[1] : (t.split(" ")[0] ?? "");
}
