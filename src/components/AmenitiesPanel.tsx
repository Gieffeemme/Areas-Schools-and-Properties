import { AmenitySummary, LatLng } from "@/lib/types";
import { osmMapUrl } from "@/lib/sources";
import SourceLink from "./SourceLink";

export default function AmenitiesPanel({
  amenities,
  centre,
}: {
  amenities: AmenitySummary | null;
  centre?: LatLng;
}) {
  if (!amenities) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
        <Head />
        <p className="mt-2 text-sm text-[var(--muted)]">
          Amenity data (OpenStreetMap) is temporarily unavailable.
        </p>
      </section>
    );
  }

  const cats = amenities.categories;
  const total = cats.reduce((n, c) => n + c.count, 0);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <Head sub={`Within ~${amenities.radiusMiles} mile`} />
      {total === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">No amenities found nearby.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
          {cats.map((c) => (
            <div key={c.key} className="flex items-baseline justify-between gap-2">
              <dt className="text-sm text-[var(--muted)]">{c.label}</dt>
              <dd className="text-right">
                <span className="font-semibold tabular-nums">{c.count}</span>
                {c.nearestMiles != null && c.count > 0 && (
                  <span className="ml-1 text-xs text-[var(--muted)]">· {c.nearestMiles} mi</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Source:{" "}
        {centre ? (
          <SourceLink href={osmMapUrl(centre.lat, centre.lng)}>OpenStreetMap</SourceLink>
        ) : (
          "OpenStreetMap"
        )}
        . Count of each amenity within ~{amenities.radiusMiles} mile; “mi” is the distance to the
        nearest one.
      </p>
    </section>
  );
}

function Head({ sub }: { sub?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-semibold tracking-tight">Amenities</h2>
      {sub && <span className="text-xs text-[var(--muted)]">{sub}</span>}
    </div>
  );
}
