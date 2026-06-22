export type Route = "area" | "property";

export interface RouteDef {
  id: Route;
  label: string;
  emoji: string;
  blurb: string;
  headline: string;
  sub: string;
}

// "Find a school" and "Research an area" were the same postcode search, so they're merged: the
// search box now takes a postcode OR a school name. "Check a property" stays distinct (address-led).
export const ROUTES: RouteDef[] = [
  {
    id: "area",
    label: "Find a school & search an area",
    emoji: "🏘️",
    blurb: "Search a postcode or a school name - schools, nurseries, crime, prices & deprivation.",
    headline: "Find a school or research an area",
    sub: "Search any UK postcode - or a school name - for schools, nurseries, crime, prices and deprivation. Property checks are coming next.",
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
  return ROUTES.find((x) => x.id === r) ?? ROUTES[0];
}
