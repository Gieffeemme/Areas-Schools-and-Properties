import Card from "./Card";

const CHECKS: { label: string; status: "live" | "soon"; note: string }[] = [
  { label: "Sold price history", status: "live", note: "HM Land Registry — see the prices panel" },
  { label: "EPC & energy cost", status: "soon", note: "MHCLG EPC register" },
  { label: "Flood risk", status: "soon", note: "Environment Agency" },
  { label: "Tenure (freehold / leasehold)", status: "soon", note: "HM Land Registry" },
  { label: "Council tax band", status: "soon", note: "VOA" },
  { label: "Planning applications nearby", status: "soon", note: "Local authority" },
];

export default function PropertyChecks() {
  return (
    <Card title="Property checks" subtitle="Due diligence for a specific address">
      <ul className="space-y-2">
        {CHECKS.map((c) => (
          <li key={c.label} className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{c.label}</p>
              <p className="text-[11px] text-[var(--muted)]">{c.note}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                c.status === "live"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-slate-100 text-[var(--muted)]"
              }`}
            >
              {c.status === "live" ? "Live" : "Soon"}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        “Soon” checks arrive with their data pipelines — the PostGIS schema and ETL scaffolds are
        already in place.
      </p>
    </Card>
  );
}
