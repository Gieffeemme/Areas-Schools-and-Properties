// External link builders for a school, keyed by DfE URN. URL patterns verified live (Jun 2026):
//  - DfE "compare school performance" 200s on /school/{urn} (redirects to add the name slug).
//  - Ofsted report: the /provider/{type}/{urn} type code varies per school (21, 23, …), so a direct
//    link 404s for most. search?q={urn} reliably surfaces the school for any URN.
//  - Ofsted early years: the EY register uses a stable provider-type code of 16, so EY settings
//    (nurseries) deep-link straight to the live provider page - which now shows the new (Nov 2025+)
//    report-card grade that the bulk MI download doesn't yet carry. Verified for EY URN 2821756.
//  - Parent View results deep-link via ?urn= on /parent-view-results (not /parent-reviews).

export const dfePerformanceUrl = (urn: string) =>
  `https://www.compare-school-performance.service.gov.uk/school/${urn}`;

export const ofstedReportUrl = (urn: string) =>
  `https://reports.ofsted.gov.uk/search?q=${urn}`;

export const ofstedEarlyYearsUrl = (urn: string) =>
  `https://reports.ofsted.gov.uk/provider/16/${urn}`;

export const parentViewUrl = (urn: string) =>
  `https://parentview.ofsted.gov.uk/parent-view-results?urn=${urn}`;

// Welsh Government "My Local School" — the per-school page (performance, attendance, pupils + an Estyn
// link), keyed by the Welsh school number. The Welsh equivalent of the Ofsted/DfE school pages.
export const myLocalSchoolUrl = (number: string) =>
  `https://mylocalschool.gov.wales/School/${number}?lang=en`;

// NI "Schools Plus" institution directory (Dept of Education NI). No clean per-school deep link exists,
// so this is the authoritative NI school directory to look the school up in (+ find its ETI reports).
export const niSchoolsDirectoryUrl = () =>
  "https://apps.education-ni.gov.uk/appinstitutes/default.aspx";

// Education Scotland "Parentzone" school information dashboard — the official per-school info source
// (no clean per-school deep link, so we link the dashboard to look the school up).
export const parentzoneScotlandUrl = () =>
  "https://education.gov.scot/parentzone/my-school/school-information-dashboard/";
