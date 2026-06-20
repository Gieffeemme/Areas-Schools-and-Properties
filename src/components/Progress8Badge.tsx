// Outlined pill (distinct from the solid Ofsted badge) showing a school's Progress 8 score.
// DfE bands: >=0.5 well above average, 0 to 0.5 above, -0.5 to 0 below, <=-0.5 well below.
export default function Progress8Badge({ value, year }: { value: number; year?: string }) {
  const color =
    value >= 0.5 ? "#15803d" : value >= 0 ? "#0d9488" : value > -0.5 ? "#d97706" : "#dc2626";
  const label = `${value > 0 ? "+" : ""}${value.toFixed(2)}`;
  return (
    <span
      title={`Progress 8${year ? ` (${year})` : ""}: ${label}`}
      className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold"
      style={{ color, borderColor: color }}
    >
      P8 {label}
    </span>
  );
}
