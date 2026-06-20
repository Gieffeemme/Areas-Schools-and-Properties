"use client";

import { useEffect, useRef } from "react";
import { LatLng, School } from "@/lib/types";
import { RATING_COLORS } from "@/lib/ratings";

interface Props {
  centre: LatLng;
  schools: School[];
  radiusMiles: number;
}

// Remounted per search via a `key` on the centre, so building once on mount is correct.
export default function AreaMap({ centre, schools, radiusMiles }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    let destroyed = false;
    const radiusMetres = radiusMiles * 1609.34;

    import("leaflet").then((L) => {
      if (destroyed || !mapRef.current || mapInstance.current) return;

      // @ts-expect-error leaflet private
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current, { scrollWheelZoom: false }).setView(
        [centre.lat, centre.lng],
        14,
      );
      mapInstance.current = map;

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OpenStreetMap © CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      // 1-mile distance guide
      L.circle([centre.lat, centre.lng], {
        radius: radiusMetres,
        color: "#4f46e5",
        weight: 1.5,
        fillColor: "#4f46e5",
        fillOpacity: 0.05,
      }).addTo(map);

      // Search location
      const centreIcon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#4f46e5;border:3px solid #fff;box-shadow:0 0 0 2px #4f46e5;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker([centre.lat, centre.lng], { icon: centreIcon })
        .addTo(map)
        .bindPopup("<strong>Your location</strong>");

      // School pins, coloured by Ofsted rating
      schools.forEach((s) => {
        const color = RATING_COLORS[s.ofsted];
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:13px;height:13px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35);"></div>`,
          iconSize: [13, 13],
          iconAnchor: [6, 12],
        });
        L.marker([s.lat, s.lng], { icon })
          .addTo(map)
          .bindPopup(
            `<strong>${escapeHtml(s.name)}</strong><br>` +
              `${s.phase ? escapeHtml(s.phase) + " · " : ""}${s.distanceMiles} mi<br>` +
              `<span style="display:inline-block;margin-top:4px;padding:1px 7px;border-radius:9px;color:#fff;font-size:11px;background:${color}">${escapeHtml(ratingText(s.ofsted))}</span>`,
          );
      });

      const dLat = radiusMetres / 111320;
      const dLng = radiusMetres / (111320 * Math.cos((centre.lat * Math.PI) / 180));
      map.fitBounds(
        [
          [centre.lat - dLat, centre.lng - dLng],
          [centre.lat + dLat, centre.lng + dLng],
        ],
        { padding: [24, 24] },
      );
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
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function ratingText(r: School["ofsted"]): string {
  return r === "Not loaded" ? "Ofsted: not loaded" : r;
}
