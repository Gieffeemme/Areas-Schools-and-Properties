import { School } from "@/lib/types";
import RatingBadge from "./RatingBadge";
import Progress8Badge from "./Progress8Badge";
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
                  {[s.phase, `${s.distanceMiles} mi`, s.ofstedDate ? `Ofsted ${s.ofstedDate.slice(0, 4)}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {typeof s.progress8 === "number" && (
                  <Progress8Badge value={s.progress8} year={s.ks4Year} />
                )}
                <RatingBadge rating={s.ofsted} small />
              </div>
            </li>
          ))}
        </ul>
      )}

      {schools.length > 12 && (
        <p className="mt-2 text-xs text-[var(--muted)]">+{schools.length - 12} more in this radius</p>
      )}

      {ofstedLoaded ? (
        <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
          Ofsted overall grades from official MI — check the inspection year; many pre-date Ofsted’s
          2024 grade changes. Independent schools aren’t Ofsted-rated.
        </p>
      ) : schools.length > 0 ? (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
          Locations are live from OpenStreetMap. Ofsted grades aren’t loaded — run{" "}
          <code className="rounded bg-amber-100 px-1 font-mono">npm run etl:schools</code>.
        </p>
      ) : null}
    </Card>
  );
}
