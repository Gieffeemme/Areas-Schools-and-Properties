// "View the source" links for the area & property data, so every panel can cite where its numbers
// come from. (School links live in links.ts.) Where a service is a stateful form with no GET deep-link
// - VOA council tax, EA flood, police.uk, Ofcom - we link its start page; where a clean key exists
// (EPC certificate, OSM feature, postcode) we deep-link. URL patterns current as of Jun 2026.
const enc = encodeURIComponent;

// HM Land Registry Price Paid search (postcode best-effort; falls back to the search form if ignored).
export const priceSourceUrl = (postcode?: string) =>
  postcode
    ? `https://landregistry.data.gov.uk/app/ppd?postcode=${enc(postcode)}`
    : "https://landregistry.data.gov.uk/app/ppd";

export const crimeSourceUrl = () => "https://www.police.uk/";

export const imdSourceUrl = () =>
  "https://www.gov.uk/government/statistics/english-indices-of-deprivation-2019";

export const broadbandSourceUrl = () => "https://checker.ofcom.org.uk/en-gb/broadband-coverage";

export const noiseSourceUrl = () =>
  "https://www.gov.uk/government/publications/strategic-noise-mapping-2019";

// Stateful Play form, no GET deep-link by location → its start page.
export const floodSourceUrl = () => "https://check-long-term-flood-risk.service.gov.uk/postcode";

// VOA "Check your Council Tax band" - also a stateful form → its start page.
export const councilTaxSourceUrl = () =>
  "https://www.tax.service.gov.uk/check-council-tax-band/search";

// MHCLG "Find an energy certificate": a specific certificate by its LMK key, or the postcode search.
export const epcCertificateUrl = (lmk: string) =>
  `https://find-energy-certificate.service.gov.uk/energy-certificate/${enc(lmk)}`;
export const epcPostcodeUrl = (postcode: string) =>
  `https://find-energy-certificate.service.gov.uk/find-a-certificate/search-by-postcode?postcode=${enc(postcode)}`;

// PlanIt - a third-party aggregator of UK local-authority planning registers (no official national
// planning-application API exists). Per-application records deep-link to the council's own register
// (the record's `url`); this is the PlanIt search start page for the area attribution.
export const planningSourceUrl = () => "https://www.planit.org.uk/";

// OpenStreetMap: a specific feature ("node/123") or a map centred on a point.
export const osmFeatureUrl = (osm: string) => `https://www.openstreetmap.org/${osm}`;
export const osmMapUrl = (lat: number, lng: number, zoom = 16) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
