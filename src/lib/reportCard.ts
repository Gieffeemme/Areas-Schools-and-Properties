// Ofsted early-years "report card" model - the NEW framework that took effect November 2025.
//
// This is a different scale from the legacy `OfstedRating` (Outstanding/Good/RI/Inadequate) in
// types.ts: a 5-band judgement per evaluation area, with no single 1–4 "overall effectiveness".
// Records are produced by scripts/etl/build-report-cards.mjs, which SCRAPES the live provider pages
// (reports.ofsted.gov.uk/provider/16/{urn}) because Ofsted's bulk MI download does not yet carry
// new-framework outcomes - so a re-inspected setting otherwise shows a stale old grade.
//
// Wired into the app: src/lib/schools.ts reads report-cards-by-urn.json at runtime (memoised) and
// attaches the card to each nursery; gradeDisplay() then prefers it over the legacy bulk-MI grade.
// Build/refresh it with `npm run etl:report-cards -- --discover`.

import type { OfstedRating } from "./types";
import { RATING_COLORS, RATING_LABELS } from "./ratings";

export type ReportCardBand =
  | "exceptional"
  | "strong"
  | "expected"
  | "needs-attention"
  | "urgent";

/** The 5-band early-years scale, best→worst, with Ofsted's exact brand colours (verified Jun 2026
 *  against the live scale graphic and the gov.uk "understanding report cards" guidance). */
export const REPORT_CARD_BANDS: { code: ReportCardBand; label: string; short: string; colour: string }[] = [
  { code: "exceptional", label: "Exceptional", short: "Exceptional", colour: "#0176E0" },
  { code: "strong", label: "Strong standard", short: "Strong", colour: "#33903C" },
  { code: "expected", label: "Expected standard", short: "Expected", colour: "#5CD168" },
  { code: "needs-attention", label: "Needs attention", short: "Needs attn", colour: "#FF8341" },
  { code: "urgent", label: "Urgent improvement", short: "Urgent", colour: "#CE1E02" },
];

export const REPORT_CARD_LABEL: Record<ReportCardBand, string> = Object.fromEntries(
  REPORT_CARD_BANDS.map((b) => [b.code, b.label]),
) as Record<ReportCardBand, string>;

export const REPORT_CARD_COLOUR: Record<ReportCardBand, string> = Object.fromEntries(
  REPORT_CARD_BANDS.map((b) => [b.code, b.colour]),
) as Record<ReportCardBand, string>;

export const REPORT_CARD_SHORT: Record<ReportCardBand, string> = Object.fromEntries(
  REPORT_CARD_BANDS.map((b) => [b.code, b.short]),
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

export interface GradeDisplay {
  label: string;
  colour: string;
  isReportCard: boolean;
}

/**
 * The grade to SHOW for a setting. Prefer the new report-card band when we have one (current, scraped
 * from the live page); otherwise fall back to the legacy Ofsted rating from the bulk data. Lets the
 * old 4-band scale keep working for everything that hasn't got a report card yet.
 */
export function gradeDisplay(
  reportCard: ReportCard | null | undefined,
  legacy: OfstedRating,
): GradeDisplay {
  if (reportCard) {
    return {
      label: reportCard.overallLabel,
      colour: REPORT_CARD_COLOUR[reportCard.overall],
      isReportCard: true,
    };
  }
  return { label: RATING_LABELS[legacy], colour: RATING_COLORS[legacy], isReportCard: false };
}

// Approximate cross-scale ordering (lower = better) for sorting/comparing settings that may be on
// EITHER the legacy 4-band Ofsted scale or the new 5-band report-card scale. Ofsted publishes no
// official crosswalk, so this interleaves them by rough equivalence (Strong ~ Outstanding/Good,
// Expected ~ Good, Needs attention ~ Requires improvement, Urgent ~ Inadequate). Unrated → 9 (sinks).
const GRADE_RANK: Record<string, number> = {
  exceptional: 0,
  Outstanding: 1,
  strong: 2,
  Good: 3,
  expected: 4,
  "Requires improvement": 5,
  "needs-attention": 6,
  Inadequate: 7,
  urgent: 8,
};

export function gradeRank(reportCard: ReportCard | null | undefined, legacy: OfstedRating): number {
  return reportCard ? GRADE_RANK[reportCard.overall] ?? 9 : GRADE_RANK[legacy] ?? 9;
}
