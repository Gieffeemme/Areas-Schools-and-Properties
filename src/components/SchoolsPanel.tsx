import { School } from "@/lib/types";
import RatingBadge from "./RatingBadge";
import Card from "./Card";

export default function SchoolsPanel({
  schools,
  radiusMiles,
  ofstedLoaded,
}: {
  schools: School[];
  radiusMiles: number;
  ofstedLoaded: boolean;
}) {
  return (
    <Card
      title="Schools"
      subtitle={`${schools.length} within ${radiusMiles} mile${radiusMiles === 1 ? "" : "s"}`}
    >
      {schools.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No schools found in this radius.</p>
      ) : (
        <ul className="-my-1 divide-y divide-[var(--border)]">
          {schools.slice(0, 12).map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{s.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {[s.phase, `${s.distanceMiles} mi`].filter(Boolean).join(" · ")}
                </p>
              </div>
              <RatingBadge rating={s.ofsted} small />
            </li>
          ))}
        </ul>
      )}

      {schools.length > 12 && (
        <p className="mt-2 text-xs text-[var(--muted)]">+{schools.length - 12} more in this radius</p>
      )}

      {!ofstedLoaded && schools.length > 0 && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          Locations are live from OpenStreetMap. Ofsted ratings aren’t loaded — run{" "}
          <code className="rounded bg-amber-100 px-1 font-mono">npm run etl:schools</code> to pull
          the official DfE/Ofsted dataset.
        </p>
      )}
    </Card>
  );
}
