"use client";

const LAYERS: { id: string; label: string; available: boolean }[] = [
  { id: "schools", label: "Schools (Ofsted)", available: true },
  { id: "crime", label: "Crime (heatmap)", available: true },
  { id: "deprivation", label: "Deprivation (IMD)", available: true },
  { id: "prices", label: "Property prices", available: false },
  { id: "flood", label: "Flood risk", available: false },
  { id: "amenities", label: "Amenities", available: false },
];

const IMD_DOMAINS: { value: string; label: string }[] = [
  { value: "overall", label: "Overall IMD" },
  { value: "income", label: "Income" },
  { value: "employment", label: "Employment" },
  { value: "education", label: "Education & skills" },
  { value: "health", label: "Health" },
  { value: "crime", label: "Crime" },
  { value: "housing", label: "Housing & access" },
  { value: "living", label: "Living environment" },
];

export default function LayerControl({
  active,
  onToggle,
  imdDomain,
  onImdDomain,
}: {
  active: Set<string>;
  onToggle: (id: string) => void;
  imdDomain: string;
  onImdDomain: (d: string) => void;
}) {
  return (
    <div className="absolute right-3 top-3 z-10 w-52 rounded-xl border border-[var(--border)] bg-white/95 p-3 shadow-lg backdrop-blur">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
        Layers
      </p>
      <ul className="space-y-1.5">
        {LAYERS.map((l) => (
          <li key={l.id}>
            <label
              className={`flex items-center gap-2 text-sm ${
                l.available ? "cursor-pointer" : "cursor-not-allowed opacity-50"
              }`}
            >
              <input
                type="checkbox"
                disabled={!l.available}
                checked={l.available && active.has(l.id)}
                onChange={() => onToggle(l.id)}
                className="accent-[var(--primary)]"
              />
              <span>{l.label}</span>
              {!l.available && <span className="ml-auto text-[10px] text-[var(--muted)]">soon</span>}
            </label>
            {l.id === "deprivation" && active.has("deprivation") && (
              <select
                value={imdDomain}
                onChange={(e) => onImdDomain(e.target.value)}
                aria-label="IMD domain to colour by"
                className="mt-1.5 w-full rounded-md border border-[var(--border)] bg-white px-1.5 py-1 text-xs text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              >
                {IMD_DOMAINS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">
        “Soon” layers light up once their data pipelines are loaded.
      </p>
    </div>
  );
}
