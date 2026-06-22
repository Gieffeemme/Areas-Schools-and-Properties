// Ofsted early-years "report card" model — the NEW framework that took effect November 2025.
//
// This is a different scale from the legacy `OfstedRating` (Outstanding/Good/RI/Inadequate) in
// types.ts: a 5-band judgement per evaluation area, with no single 1–4 "overall effectiveness".
// Records are produced by scripts/etl/build-report-cards.mjs, which SCRAPES the live provider pages
// (reports.ofsted.gov.uk/provider/16/{urn}) because Ofsted's bulk MI download does not yet carry
// new-framework outcomes — so a re-inspected setting otherwise shows a stale old grade.
//
// ⚠️ NOT YET WIRED INTO THE APP. Before importing a full-size report-cards-by-urn.json into
// src/lib/schools.ts, do the runtime-load build cleanup (Next outputFileTracingIncludes) — bundling
// another multi-MB JSON would re-trigger the `next build` OOM. See DOCUMENTATION.md.

export type ReportCardBand =
  | "exceptional"
  | "strong"
  | "expected"
  | "needs-attention"
  | "urgent";

/** The 5-band early-years scale, best→worst, with Ofsted's exact brand colours (verified Jun 2026
 *  against the live scale graphic and the gov.uk "understanding report cards" guidance). */
export const REPORT_CARD_BANDS: { code: ReportCardBand; label: string; colour: string }[] = [
  { code: "exceptional", label: "Exceptional", colour: "#0176E0" },
  { code: "strong", label: "Strong standard", colour: "#33903C" },
  { code: "expected", label: "Expected standard", colour: "#5CD168" },
  { code: "needs-attention", label: "Needs attention", colour: "#FF8341" },
  { code: "urgent", label: "Urgent improvement", colour: "#CE1E02" },
];

export const REPORT_CARD_LABEL: Record<ReportCardBand, string> = Object.fromEntries(
  REPORT_CARD_BANDS.map((b) => [b.code, b.label]),
) as Record<ReportCardBand, string>;

export const REPORT_CARD_COLOUR: Record<ReportCardBand, string> = Object.fromEntries(
  REPORT_CARD_BANDS.map((b) => [b.code, b.colour]),
) as Record<ReportCardBand, string>;

/** One provider's new-framework report card, keyed by URN in report-cards-by-urn.json. */
export interface ReportCard {
  urn: string;
  name?: string;
  framework: "report-card";
  inspectionDate?: string; // ISO yyyy-mm-dd
  overall: ReportCardBand; // headline band shown on the live page
  overallLabel: string;
  safeguarding?: "met" | "not met";
  areas: Partial<Record<ReportCardBand, number>>; // # of evaluation areas landing at each band
  source: string; // the live provider page the record was scraped from
}
