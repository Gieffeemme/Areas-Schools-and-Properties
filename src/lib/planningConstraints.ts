import { LatLng, ListedBuilding, PlanningConstraintsSummary, PlanningDesignation } from "./types";
import { distanceMiles } from "./distance";
import { planningEntityUrl } from "./sources";

// Planning CONSTRAINTS at a point, from MHCLG's national planning data platform (planning.data.gov.uk) -
// distinct from the planning APPLICATIONS (PlanIt) in planning.ts. A live spatial query (no committed
// dataset), free + Open Government Licence v3, no key. Two calls: (1) which area designations contain the
// point (conservation area, article-4, green belt, AONB, national park, WHS, scheduled monument, TPO
// zone); (2) listed buildings near the point (they're point features, so a small box, not containment).
const BASE = "https://www.planning.data.gov.uk/entity.json";
const UA = "area-intel/1.0 (https://areas-schools-and-properties.vercel.app)";
const REVALIDATE = 60 * 60 * 24 * 7; // constraints are near-static; cache a week
const LISTED_RADIUS_M = 150; // "near this property"
const LISTED_LIMIT = 100;

// Area-designation datasets (typology "geography") to test for point containment, with display labels.
const AREA_DATASETS: [string, string][] = [
  ["conservation-area", "Conservation area"],
  ["article-4-direction-area", "Article 4 direction"],
  ["green-belt", "Green belt"],
  ["area-of-outstanding-natural-beauty", "Area of outstanding natural beauty"],
  ["national-park", "National park"],
  ["world-heritage-site", "World heritage site"],
  ["scheduled-monument", "Scheduled monument"],
  ["tree-preservation-zone", "Tree preservation zone"],
];
const LABELS = new Map(AREA_DATASETS);

interface Entity {
  entity?: number;
  name?: string;
  dataset?: string;
  reference?: string;
  point?: string; // "POINT (lng lat)"
  "listed-building-grade"?: string;
  "documentation-url"?: string;
}

async function getJson(qs: URLSearchParams): Promise<Entity[]> {
  const res = await fetch(`${BASE}?${qs}`, {
    headers: { "User-Agent": UA },
    next: { revalidate: REVALIDATE },
  });
  if (!res.ok) throw new Error(`planning.data.gov.uk returned ${res.status}`);
  const data = (await res.json()) as { entities?: Entity[] };
  return Array.isArray(data.entities) ? data.entities : [];
}

// The area designations whose polygon contains the point - one call across all the datasets.
async function fetchDesignations(centre: LatLng): Promise<PlanningDesignation[]> {
  const qs = new URLSearchParams();
  for (const [ds] of AREA_DATASETS) qs.append("dataset", ds);
  qs.set("longitude", String(centre.lng));
  qs.set("latitude", String(centre.lat));
  qs.set("geometry_relation", "intersects");
  for (const f of ["entity", "name", "dataset", "reference"]) qs.append("field", f);
  qs.set("limit", "30");
  const entities = await getJson(qs);
  return entities
    .filter((e) => e.dataset && LABELS.has(e.dataset))
    .map((e) => ({
      dataset: e.dataset!,
      label: LABELS.get(e.dataset!)!,
      name: (e.name ?? "").trim(),
      reference: (e.reference ?? "").trim(),
      url: e.entity ? planningEntityUrl(e.entity) : "https://www.planning.data.gov.uk/",
    }));
}

const M_PER_MILE = 1609.344;
const parsePoint = (p?: string): LatLng | null => {
  const m = (p ?? "").match(/POINT\s*\(([-\d.]+)\s+([-\d.]+)\)/i);
  return m ? { lng: Number(m[1]), lat: Number(m[2]) } : null;
};

// Listed buildings near the point. They're point features (a postcode centroid won't sit exactly on
// one), so query a small box and rank by distance - "heritage density / could this be listed".
async function fetchListed(centre: LatLng): Promise<PlanningConstraintsSummary["listed"]> {
  const dLat = LISTED_RADIUS_M / 111320;
  const dLng = LISTED_RADIUS_M / (111320 * Math.cos((centre.lat * Math.PI) / 180));
  const [w, e, s, n] = [centre.lng - dLng, centre.lng + dLng, centre.lat - dLat, centre.lat + dLat];
  const box = `POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
  const qs = new URLSearchParams();
  qs.set("dataset", "listed-building");
  qs.set("geometry", box);
  qs.set("geometry_relation", "intersects");
  for (const f of ["name", "listed-building-grade", "reference", "documentation-url", "point"])
    qs.append("field", f);
  qs.set("limit", String(LISTED_LIMIT));
  const entities = await getJson(qs);

  const within: ListedBuilding[] = [];
  for (const e of entities) {
    const pt = parsePoint(e.point);
    const metres = pt
      ? Math.round(distanceMiles(centre.lat, centre.lng, pt.lat, pt.lng) * M_PER_MILE)
      : LISTED_RADIUS_M;
    if (metres > LISTED_RADIUS_M) continue;
    within.push({
      name: (e.name ?? "").trim() || "Listed building",
      grade: (e["listed-building-grade"] ?? "").trim(),
      distanceMetres: metres,
      url: (e["documentation-url"] ?? "").trim() || (e.entity ? planningEntityUrl(e.entity) : ""),
    });
  }
  within.sort((a, b) => a.distanceMetres - b.distanceMetres);
  return {
    count: within.length,
    capped: entities.length >= LISTED_LIMIT, // hit the fetch limit → "count"+ in a very dense area
    radiusMetres: LISTED_RADIUS_M,
    nearest: within.slice(0, 5),
  };
}

export async function fetchPlanningConstraints(
  centre: LatLng,
): Promise<PlanningConstraintsSummary | null> {
  const [desigR, listedR] = await Promise.allSettled([fetchDesignations(centre), fetchListed(centre)]);
  // Only a total outage (both failed) hides the panel; a partial result still renders.
  if (desigR.status === "rejected" && listedR.status === "rejected") return null;
  return {
    designations: desigR.status === "fulfilled" ? desigR.value : [],
    listed:
      listedR.status === "fulfilled"
        ? listedR.value
        : { count: 0, capped: false, radiusMetres: LISTED_RADIUS_M, nearest: [] },
  };
}
