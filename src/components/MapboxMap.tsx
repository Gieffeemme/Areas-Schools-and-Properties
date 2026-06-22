"use client";

import { useEffect, useRef } from "react";
import type { GeoJSONSource, Map as MbMap } from "mapbox-gl";
import { LatLng, School } from "@/lib/types";
import { RATING_COLORS } from "@/lib/ratings";

const TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";

interface Props {
  centre: LatLng;
  schools: School[];
  radiusMiles: number;
  activeLayers: Set<string>;
  crimePoints: GeoJSON.FeatureCollection | null;
  deprivationPoints: GeoJSON.FeatureCollection | null;
  imdDomain: string;
}

// mapbox-gl is imported dynamically inside the effect so it never evaluates during SSR.
export default function MapboxMap({ centre, schools, radiusMiles, activeLayers, crimePoints, deprivationPoints, imdDomain }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MbMap | null>(null);
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !TOKEN) return;
    let cancelled = false;

    import("mapbox-gl").then(({ default: mapboxgl }) => {
      const container = containerRef.current;
      if (cancelled || !container || mapRef.current) return;
      mapboxgl.accessToken = TOKEN;

      const map = new mapboxgl.Map({
        container,
        style: "mapbox://styles/mapbox/light-v11",
        center: [centre.lng, centre.lat],
        zoom: 13.5,
        attributionControl: false,
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");
      map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");

      map.on("load", () => {
        map.addSource("ring", { type: "geojson", data: ringPolygon(centre, radiusMiles) });
        map.addLayer({
          id: "ring-fill", type: "fill", source: "ring",
          paint: { "fill-color": "#6366f1", "fill-opacity": 0.04 },
        });
        map.addLayer({
          id: "ring-line", type: "line", source: "ring",
          paint: {
            "line-color": "#6366f1",
            "line-width": 1.5,
            "line-opacity": 0.4,
            "line-dasharray": [2, 2],
          },
        });

        map.addSource("schools", { type: "geojson", data: schoolsGeo(schools) });
        map.addLayer({
          id: "schools-circle", type: "circle", source: "schools",
          layout: { visibility: vis(activeLayers, "schools") },
          paint: {
            "circle-radius": 7,
            "circle-color": ["get", "color"],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          },
        });

        map.addSource("crime", { type: "geojson", data: crimePoints ?? EMPTY });
        map.addLayer({
          id: "crime-heat", type: "heatmap", source: "crime",
          layout: { visibility: vis(activeLayers, "crime") },
          paint: {
            "heatmap-radius": 18,
            "heatmap-opacity": 0.75,
            "heatmap-color": [
              "interpolate", ["linear"], ["heatmap-density"],
              0, "rgba(0,0,0,0)", 0.2, "#fde68a", 0.5, "#f59e0b", 0.8, "#ef4444", 1, "#b91c1c",
            ],
          },
        });

        // Deprivation (IMD) surface — sampled IMD deciles as a heatmap weighted so the most-deprived
        // deciles burn hottest. Inserted beneath the school pins so they stay visible and clickable.
        map.addSource("deprivation", { type: "geojson", data: deprivationPoints ?? EMPTY });
        map.addLayer(
          {
            id: "deprivation-heat", type: "heatmap", source: "deprivation",
            layout: { visibility: vis(activeLayers, "deprivation") },
            paint: {
              "heatmap-weight": ["interpolate", ["linear"], ["get", domainProp(imdDomain)], 1, 1, 10, 0.08],
              "heatmap-radius": 32,
              "heatmap-opacity": 0.7,
              // Indigo ramp — distinct from the amber/red crime heatmap.
              "heatmap-color": [
                "interpolate", ["linear"], ["heatmap-density"],
                0, "rgba(0,0,0,0)", 0.2, "#c7d2fe", 0.45, "#818cf8", 0.7, "#6366f1", 1, "#3730a3",
              ],
            },
          },
          "schools-circle",
        );

        map.on("click", "schools-circle", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as {
            name: string; phase: string; dist: string; ofsted: string; date: string;
          };
          const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
          const year = p.date ? ` · ${p.date.slice(0, 4)}` : "";
          new mapboxgl.Popup()
            .setLngLat([lng, lat])
            .setHTML(
              `<strong>${esc(p.name)}</strong><br>${p.phase ? esc(p.phase) + " · " : ""}${p.dist} mi<br>${esc(p.ofsted)}${year}`,
            )
            .addTo(map);
        });
        map.on("mouseenter", "schools-circle", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "schools-circle", () => { map.getCanvas().style.cursor = ""; });

        map.fitBounds(ringBounds(centre, radiusMiles), { padding: 28, duration: 0 });
        loadedRef.current = true;
      });
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recenter + refresh schools/ring when the searched area changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      map.fitBounds(ringBounds(centre, radiusMiles), { padding: 28, duration: 600 });
      (map.getSource("ring") as GeoJSONSource | undefined)?.setData(ringPolygon(centre, radiusMiles));
      (map.getSource("schools") as GeoJSONSource | undefined)?.setData(schoolsGeo(schools));
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [centre.lat, centre.lng, schools, radiusMiles]);

  // Feed crime heatmap data when it arrives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => (map.getSource("crime") as GeoJSONSource | undefined)?.setData(crimePoints ?? EMPTY);
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [crimePoints]);

  // Feed the deprivation surface when it arrives.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () =>
      (map.getSource("deprivation") as GeoJSONSource | undefined)?.setData(deprivationPoints ?? EMPTY);
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [deprivationPoints]);

  // Re-weight the deprivation heatmap when the selected IMD domain changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer("deprivation-heat"))
        map.setPaintProperty("deprivation-heat", "heatmap-weight", [
          "interpolate", ["linear"], ["get", domainProp(imdDomain)], 1, 1, 10, 0.08,
        ]);
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [imdDomain]);

  // Toggle layer visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer("schools-circle"))
        map.setLayoutProperty("schools-circle", "visibility", vis(activeLayers, "schools"));
      if (map.getLayer("crime-heat"))
        map.setLayoutProperty("crime-heat", "visibility", vis(activeLayers, "crime"));
      if (map.getLayer("deprivation-heat"))
        map.setLayoutProperty("deprivation-heat", "visibility", vis(activeLayers, "deprivation"));
    };
    if (loadedRef.current) apply();
    else map.once("load", apply);
  }, [activeLayers]);

  if (!TOKEN) {
    return (
      <div className="grid h-full w-full place-items-center bg-slate-100 p-6 text-center text-sm text-[var(--muted)]">
        Set <code className="mx-1 font-mono">NEXT_PUBLIC_MAPBOX_TOKEN</code> and restart the dev
        server to load the map.
      </div>
    );
  }

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/mapbox-gl@3.25.0/dist/mapbox-gl.css" />
      <div ref={containerRef} className="h-full w-full" />
    </>
  );
}

const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

function vis(active: Set<string>, id: string): "visible" | "none" {
  return active.has(id) ? "visible" : "none";
}

// Which feature property drives the deprivation heatmap weight for the chosen IMD domain.
function domainProp(domain: string): string {
  return domain === "overall" ? "decile" : domain;
}

function schoolsGeo(schools: School[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: schools.map((s) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [s.lng, s.lat] },
      properties: {
        name: s.name,
        phase: s.phase ?? "",
        dist: String(s.distanceMiles),
        ofsted: s.ofsted,
        date: s.ofstedDate ?? "",
        color: RATING_COLORS[s.ofsted],
      },
    })),
  };
}

// Bounding box of the radius ring, so the map can zoom to show the whole selected area.
function ringBounds(centre: LatLng, radiusMiles: number): [[number, number], [number, number]] {
  const km = radiusMiles * 1.60934;
  const dLat = km / 110.574;
  const dLng = km / (111.32 * Math.cos((centre.lat * Math.PI) / 180));
  return [
    [centre.lng - dLng, centre.lat - dLat],
    [centre.lng + dLng, centre.lat + dLat],
  ];
}

function ringPolygon(centre: LatLng, radiusMiles: number): GeoJSON.Feature {
  const km = radiusMiles * 1.60934;
  const steps = 64;
  const dLat = km / 110.574;
  const dLng = km / (111.32 * Math.cos((centre.lat * Math.PI) / 180));
  const coords: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * 2 * Math.PI;
    coords.push([centre.lng + dLng * Math.cos(a), centre.lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: {} };
}

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
