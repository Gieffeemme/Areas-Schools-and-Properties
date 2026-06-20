"use client";

const LAYERS: { id: string; label: string; available: boolean }[] = [
  { id: "schools", label: "Schools (Ofsted)", available: true },
  { id: "crime", label: "Crime (heatmap)", available: true },
  { id: "deprivation", label: "Deprivation", available: false },
  { id: "prices", label: "Property prices", available: false },
  { id: "flood", label: "Flood risk", available: false },
  { id: "amenities", label: "Amenities", available: false },
];

export default function LayerControl({
  active,
  onToggle,
}: {
  active: Set<string>;
  onToggle: (id: string) => void;
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
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] leading-snug text-[var(--muted)]">
        “Soon” layers light up once their data pipelines are loaded.
      </p>
    </div>
  );
}
