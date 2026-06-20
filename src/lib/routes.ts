export type Route = "school" | "area" | "property";

export interface RouteDef {
  id: Route;
  label: string;
  emoji: string;
  blurb: string;
  headline: string;
  sub: string;
}

// The three pathways from the brief. Each tailors the default view; all share one data engine.
export const ROUTES: RouteDef[] = [
  {
    id: "school",
    label: "Find a school",
    emoji: "🎓",
    blurb: "Compare schools near a location by Ofsted & distance.",
    headline: "Find the right school",
    sub: "Every school near a postcode with its Ofsted grade, phase and distance — no move required.",
  },
  {
    id: "area",
    label: "Research an area",
    emoji: "🏘️",
    blurb: "Schools, crime, prices & deprivation for a neighbourhood.",
    headline: "Know an area before you move",
    sub: "Schools, crime, property prices and deprivation around any UK postcode — one place, open data.",
  },
  {
    id: "property",
    label: "Check a property",
    emoji: "🏠",
    blurb: "Due diligence on a specific address.",
    headline: "Check a property before you offer",
    sub: "Sold-price history and area checks for an address. Energy, flood and tenure checks are coming.",
  },
];

export const DEFAULT_ROUTE: Route = "area";

export function routeDef(r: Route): RouteDef {
  return ROUTES.find((x) => x.id === r) ?? ROUTES[1];
}
