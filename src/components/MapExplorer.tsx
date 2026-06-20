"use client";

import { useCallback, useState } from "react";
import PostcodeSearch from "./PostcodeSearch";
import MapboxMap from "./MapboxMap";
import LayerControl from "./LayerControl";
import RatingBadge from "./RatingBadge";
import Progress8Badge from "./Progress8Badge";
import ParentViewBadge from "./ParentViewBadge";
import { AreaReport } from "@/lib/types";

export default function MapExplorer() {
  const [report, setReport] = useState<AreaReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<Set<string>>(new Set(["schools"]));
  const [crime, setCrime] = useState<GeoJSON.FeatureCollection | null>(null);

  const search = useCallback(async (postcode: string) => {
    setLoading(true);
    setError(null);
    setCrime(null);
    try {
      const res = await fetch(`/api/area?postcode=${encodeURIComponent(postcode)}&radius=1`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Search failed");
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = useCallback(
    async (id: string) => {
      const turningOn = !active.has(id);
      setActive((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      // Lazy-load crime points the first time the crime layer is enabled.
      if (id === "crime" && turningOn && !crime && report) {
        try {
          const res = await fetch(
            `/api/crime-points?lat=${report.centre.lat}&lng=${report.centre.lng}`,
          );
          if (res.ok) setCrime(await res.json());
        } catch {
          /* heatmap stays empty */
        }
      }
    },
    [active, crime, report],
  );

  return (
    <div className="flex h-[calc(100vh-57px)] flex-col">
      <div className="border-b border-[var(--border)] bg-white px-4 py-3">
        <div className="mx-auto max-w-xl">
          <PostcodeSearch onSearch={search} loading={loading} />
        </div>
        {error && <p className="mx-auto mt-2 max-w-xl text-sm text-red-700">{error}</p>}
      </div>

      <div className="grid flex-1 grid-rows-[55vh_1fr] overflow-hidden lg:grid-cols-[1fr_340px] lg:grid-rows-1">
        <div className="relative">
          {report ? (
            <>
              <MapboxMap
                centre={report.centre}
                schools={report.schools}
                radiusMiles={report.radiusMiles}
                activeLayers={active}
                crimePoints={crime}
              />
              <LayerControl active={active} onToggle={toggle} />
            </>
          ) : (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-[var(--muted)]">
              {loading ? "Loading area…" : "Search a postcode to load the map."}
            </div>
          )}
        </div>

        <aside className="overflow-y-auto border-t border-[var(--border)] bg-white p-4 lg:border-l lg:border-t-0">
          {report ? (
            <>
              <h2 className="text-lg font-bold tracking-tight">{report.facts.postcode}</h2>
              <p className="text-xs text-[var(--muted)]">
                {[report.facts.district, report.facts.region].filter(Boolean).join(", ")}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {report.schools.length} schools within {report.radiusMiles} mile
                {report.radiusMiles === 1 ? "" : "s"}
              </p>
              <ul className="mt-3 divide-y divide-[var(--border)]">
                {report.schools.slice(0, 40).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-2">
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
                      {typeof s.parentViewHappy === "number" && (
                        <ParentViewBadge pct={s.parentViewHappy} responses={s.parentViewResponses} />
                      )}
                      <RatingBadge rating={s.ofsted} small />
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-sm text-[var(--muted)]">Schools will appear here.</p>
          )}
        </aside>
      </div>
    </div>
  );
}
