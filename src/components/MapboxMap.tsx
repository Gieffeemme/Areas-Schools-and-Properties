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
}

// mapbox-gl is imported dynamically inside the effect so it never evaluates during SSR.
export default function MapboxMap({ centre, schools, radiusMiles, activeLayers, crimePoints }: Props) {
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
      });
      mapRef.current = map;
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-left");

      map.on("load", () => {
        map.addSource("ring", { type: "geojson", data: ringPolygon(centre, radiusMiles) });
        map.addLayer({
          id: "ring-fill", type: "fill", source: "ring",
          paint: { "fill-color": "#4f46e5", "fill-opacity": 0.06 },
        });
        map.addLayer({
          id: "ring-line", type: "line", source: "ring",
          paint: { "line-color": "#4f46e5", "line-width": 1.5 },
        });

        map.addSource("schools", { type: "geojson", data: schoolsGeo(schools) });
        map.addLayer({
          id: "schools-circle", type: "circle", source: "schools",
          layout: { visibility: vis(activeLayers, "schools") },
          paint: {
            "circle-radius": 6,
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

        map.on("click", "schools-circle", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const p = f.properties as { name: string; phase: string; dist: string; ofsted: string };
          const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
          new mapboxgl.Popup()
            .setLngLat([lng, lat])
            .setHTML(
              `<strong>${esc(p.name)}</strong><br>${p.phase ? esc(p.phase) + " · " : ""}${p.dist} mi<br>${esc(p.ofsted)}`,
            )
            .addTo(map);
        });
        map.on("mouseenter", "schools-circle", () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", "schools-circle", () => { map.getCanvas().style.cursor = ""; });

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
      map.flyTo({ center: [centre.lng, centre.lat], zoom: 13.5, essential: true });
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

  // Toggle layer visibility.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      if (map.getLayer("schools-circle"))
        map.setLayoutProperty("schools-circle", "visibility", vis(activeLayers, "schools"));
      if (map.getLayer("crime-heat"))
        map.setLayoutProperty("crime-heat", "visibility", vis(activeLayers, "crime"));
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
        color: RATING_COLORS[s.ofsted],
      },
    })),
  };
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
