import { OfstedRating } from "@/lib/types";
import { RATING_COLORS, RATING_LABELS } from "@/lib/ratings";

export default function RatingBadge({
  rating,
  small = false,
}: {
  rating: OfstedRating;
  small?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full font-semibold text-white ${
        small ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
      }`}
      style={{ backgroundColor: RATING_COLORS[rating] }}
    >
      {RATING_LABELS[rating]}
    </span>
  );
}
