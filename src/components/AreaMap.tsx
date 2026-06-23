"use client";

import { useEffect, useRef } from "react";
import { LatLng, School } from "@/lib/types";
import { markerSvg, phaseShapeKey, pinGrade } from "@/lib/mapMarkers";

interface Props {
  centre: LatLng;
  schools: School[];
  radiusMiles: number;
  onSelect: (s: School) => void;
}

// Remounted per search via a `key` on the centre, so building once on mount is correct.
export default function AreaMap({ centre, schools, radiusMiles, onSelect }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<unknown>(null);
  // Keep the latest onSelect so the (mount-only) popup click listeners never go stale.
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

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
      map.attributionControl.setPrefix("");

      L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
        attribution: "© OSM, CARTO",
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      // 1-mile distance guide - subtle, dashed
      L.circle([centre.lat, centre.lng], {
        radius: radiusMetres,
        color: "#6366f1",
        weight: 1.5,
        opacity: 0.4,
        dashArray: "6 6",
        fillColor: "#6366f1",
        fillOpacity: 0.03,
      }).addTo(map);

      // Search location
      const centreIcon = L.divIcon({
        className: "",
        html: `<div style="width:16px;height:16px;border-radius:50%;background:#6366f1;border:3px solid #fff;box-shadow:0 0 0 2px #6366f1;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      });
      L.marker([centre.lat, centre.lng], { icon: centreIcon })
        .addTo(map)
        .bindPopup("<strong>Your location</strong>");

      // School pins: shape = phase, colour = Ofsted grade. The name is a button that opens
      // the full detail drawer (via onSelect) - same as clicking a list card.
      schools.forEach((s) => {
        const { label, colour } = pinGrade(s);
        const icon = L.divIcon({
          className: "",
          html: markerSvg(phaseShapeKey(s.phase), colour),
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        const popupEl = document.createElement("div");
        popupEl.innerHTML =
          `<button type="button" class="am-popup-name" title="View full details" style="display:inline;padding:0;border:0;background:none;font:inherit;font-weight:700;color:#6366f1;text-decoration:underline;cursor:pointer;text-align:left">${escapeHtml(s.name)}</button><br>` +
          `${s.phase ? escapeHtml(s.phase) + " · " : ""}${s.distanceMiles} mi<br>` +
          `<span style="display:inline-block;margin-top:4px;padding:1px 7px;border-radius:9px;color:#fff;font-size:11px;background:${colour}">${escapeHtml(label)}</span>`;
        popupEl.querySelector(".am-popup-name")?.addEventListener("click", () => {
          map.closePopup();
          onSelectRef.current?.(s);
        });
        L.marker([s.lat, s.lng], { icon }).addTo(map).bindPopup(popupEl);
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
