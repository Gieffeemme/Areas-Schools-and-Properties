import { OfstedRating } from "@/lib/types";
import { RATING_COLORS, RATING_LABELS } from "@/lib/ratings";

// Compact labels for tight rows (list/map) so the badge never truncates.
const SHORT: Record<OfstedRating, string> = {
  Outstanding: "Outstanding",
  Good: "Good",
  "Requires improvement": "RI",
  Inadequate: "Inadequate",
  "Not rated": "Not rated",
  "Not loaded": "—",
};

export default function RatingBadge({
  rating,
  small = false,
}: {
  rating: OfstedRating;
  small?: boolean;
}) {
  return (
    <span
      title={RATING_LABELS[rating]}
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-semibold text-white ${
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
      style={{ backgroundColor: RATING_COLORS[rating] }}
    >
      {small ? SHORT[rating] : RATING_LABELS[rating]}
    </span>
  );
}
