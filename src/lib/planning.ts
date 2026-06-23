import { LatLng, PlanningApplication, PlanningSummary } from "./types";

// PlanIt (https://www.planit.org.uk) aggregates UK local-authority planning registers into one API.
// There is no official national planning-application API (planning.data.gov.uk is constraints only,
// not application records), so PlanIt is the practical source. No key; a real User-Agent is expected.
const PLANIT = "https://www.planit.org.uk/api/applics/json";
const UA = "area-intel/1.0 (https://areas-schools-and-properties.vercel.app)";

interface PlanItRecord {
  uid?: string;
  reference?: string | null;
  name?: string;
  address?: string;
  description?: string;
  app_state?: string;
  app_type?: string;
  start_date?: string;
  decided_date?: string | null;
  area_name?: string;
  distance?: number;
  url?: string | null; // deep link to the council's own record
  link?: string; // the PlanIt page for the application
}

/**
 * Planning applications near a point, via PlanIt. Most-recently-submitted first (PlanIt's default
 * order is NOT recency, so we ask for sort=-start_date), within ~0.5 km. `total` is the all-time count
 * PlanIt holds for that area; `recent` is the newest few, each linking to the official council record.
 * Fails gracefully to null so the report still renders without it. Cached 6h to be polite to PlanIt.
 */
export async function fetchPlanning(centre: LatLng, radiusKm = 0.5): Promise<PlanningSummary | null> {
  const qs = new URLSearchParams({
    lat: String(centre.lat),
    lng: String(centre.lng),
    krad: String(radiusKm),
    pg_sz: "20",
    sort: "-start_date",
  });
  try {
    const res = await fetch(`${PLANIT}?${qs.toString()}`, {
      headers: { "User-Agent": UA },
      next: { revalidate: 21600 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { total?: number; records?: PlanItRecord[] };
    const records = Array.isArray(data.records) ? data.records : [];
    const recent = records.slice(0, 5).map(toApplication);
    return {
      total: typeof data.total === "number" ? data.total : recent.length,
      radiusKm,
      recent,
    };
  } catch {
    return null;
  }
}

function toApplication(r: PlanItRecord): PlanningApplication {
  return {
    reference: (r.reference || r.uid || r.name || "").trim() || "-",
    address: (r.address ?? "").trim(),
    description: (r.description ?? "").trim(),
    status: (r.app_state ?? "").trim() || "Unknown",
    type: (r.app_type ?? "").trim(),
    date: (r.start_date ?? "").trim(),
    decidedDate: r.decided_date ? r.decided_date.trim() : undefined,
    authority: (r.area_name ?? "").trim(),
    distanceKm: typeof r.distance === "number" ? r.distance : 0,
    url: (r.url || r.link || "").trim(),
  };
}
