// External link builders for a school, keyed by DfE URN. URL patterns verified live (Jun 2026):
//  - DfE "compare school performance" 200s on /school/{urn} (redirects to add the name slug).
//  - Ofsted report: the /provider/{type}/{urn} type code varies per school (21, 23, …), so a direct
//    link 404s for most. search?q={urn} reliably surfaces the school for any URN.
//  - Parent View results deep-link via ?urn= on /parent-view-results (not /parent-reviews).

export const dfePerformanceUrl = (urn: string) =>
  `https://www.compare-school-performance.service.gov.uk/school/${urn}`;

export const ofstedReportUrl = (urn: string) =>
  `https://reports.ofsted.gov.uk/search?q=${urn}`;

export const parentViewUrl = (urn: string) =>
  `https://parentview.ofsted.gov.uk/parent-view-results?urn=${urn}`;
