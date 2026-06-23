import { TransportStation, TransportSummary } from "@/lib/types";

// Nearest rail/metro/tram stations (OpenStreetMap) — a connectivity signal: the named nearest
// station(s), however far, distinct from the amenities walkable density count (stations within 1 mi).
export default function TransportPanel({ transport }: { transport: TransportSummary | null }) {
  if (!transport) {
    return (
      <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
        <Head />
        <p className="mt-2 text-sm text-[var(--muted)]">
          Transport data (OpenStreetMap) is temporarily unavailable.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <Head sub="Nearest stations" />
      {transport.stations.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          No train, tram or metro station within {transport.searchRadiusMiles} miles.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--border)]">
          {transport.stations.map((s) => (
            <li key={`${s.kind}-${s.name}`} className="flex items-center justify-between gap-3 py-2">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{s.name}</span>
                <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {STATION_KIND[s.kind]}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {fmtMiles(s.distanceMiles)} mi
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Source: OpenStreetMap. Straight-line distance to the nearest stations (not walking time);
        station &amp; bus-stop <em>counts</em> are in Amenities.
      </p>
    </section>
  );
}

function Head({ sub }: { sub?: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-sm font-semibold tracking-tight">Transport</h2>
      {sub && <span className="text-xs text-[var(--muted)]">{sub}</span>}
    </div>
  );
}

const STATION_KIND: Record<TransportStation["kind"], string> = {
  rail: "Train",
  metro: "Underground / Metro",
  light_rail: "Light rail",
  tram: "Tram",
};
const fmtMiles = (m: number) => (m < 0.1 ? "<0.1" : m.toFixed(1));
