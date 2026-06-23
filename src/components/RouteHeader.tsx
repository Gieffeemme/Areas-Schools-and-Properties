import RouteSelector from "./RouteSelector";
import { Route, routeDef } from "@/lib/routes";

// Shared top of both entry paths (search an area / check a property): the headline + blurb that change
// per path, above the two-tile route selector that stays put. Keeping it in one component means the two
// landings can't drift - navigation is identical on both, and only the title and the search bar beneath
// it differ between the paths.
export default function RouteHeader({ route, onRoute }: { route: Route; onRoute: (r: Route) => void }) {
  const def = routeDef(route);
  return (
    <div>
      <div className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{def.headline}</h1>
        <p className="mx-auto mt-3 max-w-xl text-[var(--muted)]">{def.sub}</p>
      </div>
      <p className="mt-8 mb-2 text-center text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        What are you trying to do?
      </p>
      <RouteSelector value={route} onChange={onRoute} variant="cards" />
    </div>
  );
}
