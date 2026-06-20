// Unified data pill: fixed 22px height, 11px text, 4px radius, tinted background of `color`.
// Same shape everywhere so Ofsted / Progress 8 / happiness read as one consistent system.
export default function Pill({
  color,
  children,
  title,
}: {
  color: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="inline-flex h-[22px] shrink-0 items-center whitespace-nowrap rounded px-2 text-[11px] font-semibold leading-none"
      style={{ backgroundColor: `${color}1f`, color }}
    >
      {children}
    </span>
  );
}
