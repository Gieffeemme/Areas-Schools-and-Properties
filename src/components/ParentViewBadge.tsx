// Ofsted Parent View happiness - % who agree "My child is happy at this school".
// Outlined pill (matches Progress8Badge) with a smiley + colour band.
export default function ParentViewBadge({
  pct,
  responses,
}: {
  pct: number;
  responses?: number;
}) {
  const { color, face } =
    pct >= 90
      ? { color: "#15803d", face: "😄" }
      : pct >= 75
        ? { color: "#0d9488", face: "🙂" }
        : pct >= 50
          ? { color: "#d97706", face: "😐" }
          : { color: "#dc2626", face: "🙁" };
  return (
    <span
      title={`Parent View - "My child is happy at this school": ${pct}% agree${
        responses != null ? ` (${responses} responses)` : ""
      }`}
      className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ color, borderColor: color }}
    >
      {face} {pct}%
    </span>
  );
}
