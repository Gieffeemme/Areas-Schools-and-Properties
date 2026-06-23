import { EvChargingSummary, LatLng } from "@/lib/types";
import { evChargingSourceUrl } from "@/lib/sources";
import SourceLink from "./SourceLink";

export default function EvChargingPanel({
  ev,
  centre,
}: {
  ev: EvChargingSummary | null;
  centre: LatLng;
}) {
  if (!ev) return null; // dataset missing → hide

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">EV charging</h2>
        <span className="text-xs text-[var(--muted)]">within ~{ev.radiusMiles} mile</span>
      </div>

      {ev.count === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          No public charging locations are mapped within ~{ev.radiusMiles} mile of here.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm">
            <span className="text-lg font-bold tabular-nums">{ev.count}</span> public charging location
            {ev.count === 1 ? "" : "s"} nearby
          </p>
          <ul className="mt-2 divide-y divide-[var(--border)]">
            {ev.nearest.map((c, i) => (
              <li key={i} className="flex items-baseline justify-between gap-2 py-1.5 text-sm">
                <span className="min-w-0 truncate">{c.operator || "Charging point"}</span>
                <span className="shrink-0 text-[11px] text-[var(--muted)]">
                  {c.capacity ? `${c.capacity} point${c.capacity === 1 ? "" : "s"} · ` : ""}
                  {c.distanceMiles} mi
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Community-mapped public chargepoints from{" "}
        <SourceLink href={evChargingSourceUrl(centre.lat, centre.lng)}>OpenStreetMap</SourceLink>{" "}
        (coverage varies; the official National Chargepoint Registry closed in Nov 2024).
      </p>
    </section>
  );
}
