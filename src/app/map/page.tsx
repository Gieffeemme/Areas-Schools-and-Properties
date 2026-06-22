import type { Metadata } from "next";
import MapExplorer from "@/components/MapExplorer";

export const metadata: Metadata = {
  title: "Map - Locale",
  description: "Map-first UK area & school explorer: school pins, crime heatmap, and more.",
};

export default function MapPage() {
  return <MapExplorer />;
}
