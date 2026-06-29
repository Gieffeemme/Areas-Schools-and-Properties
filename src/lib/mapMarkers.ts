import type { School } from "./types";
import { gradeDisplay } from "./reportCard";
import { RATING_COLORS } from "./ratings";
import { NATION_SCHOOL_INFO } from "./nations";

// Map markers encode two things at once: SHAPE = school phase, COLOUR = Ofsted grade. The shapes are
// SVG path data in an 18×18 box, reused three ways - Leaflet divIcon HTML, Mapbox SDF icons (via
// Path2D, which parses the same path strings), and the dashboard legend.
export type ShapeKey = "circle" | "square" | "triangle" | "diamond" | "hexagon";

export const SHAPE_PATH: Record<ShapeKey, string> = {
  circle: "M2.5,9a6.5,6.5 0 1,0 13,0a6.5,6.5 0 1,0 -13,0",
  square: "M3,3H15V15H3Z",
  triangle: "M9,2L15.5,15H2.5Z",
  diamond: "M9,1.5L16.5,9L9,16.5L1.5,9Z",
  hexagon: "M9,1.5L15.5,5.25V12.75L9,16.5L2.5,12.75V5.25Z",
};

// Phase → shape. Sixth form / college share the post-16 triangle; unknown phase falls back to a circle.
export function phaseShapeKey(phase?: string): ShapeKey {
  switch (phase) {
    case "Primary":
      return "circle";
    case "Secondary":
      return "square";
    case "Sixth form":
    case "College":
      return "triangle";
    case "All-through":
      return "diamond";
    case "Nursery":
      return "hexagon";
    default:
      return "circle";
  }
}

// Legend rows (phase → shape).
export const PHASE_SHAPES: { label: string; shape: ShapeKey }[] = [
  { label: "Nursery", shape: "hexagon" },
  { label: "Primary", shape: "circle" },
  { label: "Secondary", shape: "square" },
  { label: "Sixth form / college", shape: "triangle" },
  { label: "All-through", shape: "diamond" },
];

// A standalone SVG marker string (Leaflet divIcon + the legend): the shape filled with `color`, white outline.
export function markerSvg(shape: ShapeKey, color: string, size = 18, shadow = true): string {
  const filter = shadow ? "filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.4));" : "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="${filter}display:block"><path d="${SHAPE_PATH[shape]}" fill="${color}" stroke="#fff" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

// The pin's grade colour + label, handling all three Ofsted states: a report card → its band; a
// post-Sept-2024 graded inspection with no single grade → "No overall grade" (NOT a misleading "Not
// rated"); otherwise the legacy grade.
export function pinGrade(s: School): { label: string; colour: string } {
  // Non-England schools have no Ofsted grade (devolved inspectorates give no single judgement) - a
  // neutral slate pin and an honest label, never a misleading "Not rated".
  if (s.nation) {
    const info = NATION_SCHOOL_INFO[s.nation];
    return { label: `${info.short} (${info.inspectorate})`, colour: "#64748b" };
  }
  if (!s.reportCard && s.ofstedNoOverall) {
    return { label: "No overall grade", colour: RATING_COLORS["Not rated"] };
  }
  const g = gradeDisplay(s.reportCard, s.ofsted);
  return { label: g.label, colour: g.colour };
}
