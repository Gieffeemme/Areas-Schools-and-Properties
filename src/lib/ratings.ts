import { OfstedRating } from "./types";

/** Single source of truth for Ofsted colours, shared by map pins and badges. */
export const RATING_COLORS: Record<OfstedRating, string> = {
  Outstanding: "#16a34a",
  Good: "#2563eb",
  "Requires improvement": "#d97706",
  Inadequate: "#dc2626",
  "Not rated": "#9ca3af",
  "Not loaded": "#9ca3af",
};

export const RATING_LABELS: Record<OfstedRating, string> = {
  Outstanding: "Outstanding",
  Good: "Good",
  "Requires improvement": "Requires improvement",
  Inadequate: "Inadequate",
  "Not rated": "Not rated",
  "Not loaded": "Ofsted: not loaded",
};

/** Map an official Ofsted rating string to our union (used by the ETL). */
export function normaliseRating(raw: string | undefined | null): OfstedRating {
  const s = (raw ?? "").trim().toLowerCase();
  if (s === "outstanding") return "Outstanding";
  if (s === "good") return "Good";
  if (s === "requires improvement" || s === "satisfactory") return "Requires improvement";
  if (s === "inadequate" || s === "serious weaknesses" || s === "special measures")
    return "Inadequate";
  return "Not rated";
}
