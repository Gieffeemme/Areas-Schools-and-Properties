"use client";

import { useEffect, useRef } from "react";
import { LatLng } from "@/lib/types";

// A minimal Leaflet map with a single marker at the property's location (CARTO tiles, no token).
// `centre` is the postcode centroid - we don't have an exact per-building point - so the caller
// should caption it as approximate. Mount-only (parent keys the report per address).
export default function PropertyMap({ centre, label }: { centre: LatLng; label?: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    let destroyed = false;

    import("leaflet").then((L) => {
      if (destroyed || !mapRef.current || mapInstance.current) return;

      const map = L.map(mapRef.current, { scrollWheelZoom: false }).setView(
        [centre.lat, centre.lng],
        16,
      );
      mapInstance.current = map;
      map.attributionControl.setPrefix("");

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OSM, CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      const icon = L.divIcon({
        className: "",
        html: `<div style="width:18px;height:18px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#6366f1;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [18, 18],
        iconAnchor: [9, 17],
      });
      const marker = L.marker([centre.lat, centre.lng], { icon }).addTo(map);
      if (label) marker.bindPopup(`<strong>${escapeHtml(label)}</strong>`);
    });

    return () => {
      destroyed = true;
      if (mapInstance.current) {
        (mapInstance.current as { remove: () => void }).remove();
        mapInstance.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <div ref={mapRef} className="h-full w-full" />
    </>
  );
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}
