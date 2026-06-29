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

// Welsh Government — Welsh Index of Multiple Deprivation (WIMD) 2025, the Wales equivalent of the IMD.
export const wimdSourceUrl = () => "https://www.gov.wales/welsh-index-multiple-deprivation-2025";

// Scottish Government — Scottish Index of Multiple Deprivation (SIMD) 2020, the Scotland equivalent.
export const simdSourceUrl = () =>
  "https://www.gov.scot/collections/scottish-index-of-multiple-deprivation-2020/";

// ONS Census 2021 - the interactive area maps where the same neighbourhood figures can be explored.
export const censusSourceUrl = () => "https://www.ons.gov.uk/census/maps";

// ONS "Income estimates for small areas" (model-based net household income by MSOA).
export const incomeSourceUrl = () =>
  "https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/earningsandworkinghours/datasets/smallareaincomeestimatesformiddlelayersuperoutputareasenglandandwales";

// ONS "Ratio of house price to workplace-based earnings" (housing affordability by local authority).
export const affordabilitySourceUrl = () =>
  "https://www.ons.gov.uk/peoplepopulationandcommunity/housing/datasets/ratioofhousepricetoworkplacebasedearningslowerquartileandmedian";

export const broadbandSourceUrl = () => "https://checker.ofcom.org.uk/en-gb/broadband-coverage";

export const mobileSourceUrl = () => "https://checker.ofcom.org.uk/en-gb/mobile-coverage";

export const noiseSourceUrl = () =>
  "https://www.gov.uk/government/publications/strategic-noise-mapping-2019";

// Defra modelled background pollution maps (PCM) — the 1 km NO2/PM2.5 background-concentration data.
export const airQualitySourceUrl = () => "https://uk-air.defra.gov.uk/data/pcm-data";

// Environment Agency bathing-water quality explorer.
export const bathingWaterSourceUrl = () => "https://environment.data.gov.uk/bwq/";

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

// planning.data.gov.uk (MHCLG): the platform start page, or a specific constraint entity's page.
export const planningDataSourceUrl = () => "https://www.planning.data.gov.uk/";
export const planningEntityUrl = (entity: number | string) =>
  `https://www.planning.data.gov.uk/entity/${entity}`;

// CQC: a specific location's profile page (deterministic from its Location ID), or the open-data page
// for the area attribution. Ratings come from the committed "care directory with filters" (OGL).
export const cqcLocationUrl = (id: string) => `https://www.cqc.org.uk/location/${enc(id)}`;
export const cqcSourceUrl = () => "https://www.cqc.org.uk/about-us/transparency/using-cqc-data";

// EV charging is committed from OpenStreetMap; cite a map of charging stations centred on the point.
export const evChargingSourceUrl = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}&layers=O`;

// OpenStreetMap: a specific feature ("node/123") or a map centred on a point.
export const osmFeatureUrl = (osm: string) => `https://www.openstreetmap.org/${osm}`;
export const osmMapUrl = (lat: number, lng: number, zoom = 16) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${zoom}/${lat}/${lng}`;
