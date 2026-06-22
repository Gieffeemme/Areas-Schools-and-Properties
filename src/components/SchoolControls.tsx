"use client";

import { School } from "@/lib/types";
import { PhaseFilter } from "@/lib/phase";
import {
  SchoolFilters,
  DEFAULT_FILTERS,
  activeFilterCount,
  filterAvailability,
} from "@/lib/schoolFilters";
import PhaseChips from "./PhaseChips";

// Phase chips + a collapsible Filters panel (Ofsted / gender / faith / grammar). Controlled and
// shared by the list panel and the map-only view so both drive the same SchoolFilters state.
export default function SchoolControls({
  schools,
  filters,
  onChange,
  className = "",
}: {
  schools: School[];
  filters: SchoolFilters;
  onChange: (f: SchoolFilters) => void;
  className?: string;
}) {
  const avail = filterAvailability(schools);
  const active = activeFilterCount(filters);
  const set = (patch: Partial<SchoolFilters>) => onChange({ ...filters, ...patch });

  return (
    <div className={className}>
      <PhaseChips
        schools={schools}
        filter={filters.phase}
        onFilter={(p: PhaseFilter) => set({ phase: p })}
        className="mb-2"
      />
      <details className="group rounded-lg border border-[var(--border)] bg-white text-xs">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-2.5 py-1.5 font-medium text-[var(--muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-[10px] transition-transform group-open:rotate-90" aria-hidden>
              ▶
            </span>
            Filters
            {active > 0 && (
              <span className="rounded-full bg-[var(--primary)] px-1.5 text-[10px] font-semibold text-white">
                {active}
              </span>
            )}
          </span>
          {active > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                onChange({ ...DEFAULT_FILTERS, phase: filters.phase });
              }}
              className="font-medium text-[var(--primary)] hover:underline"
            >
              Clear
            </button>
          )}
        </summary>
        <div className="space-y-2.5 border-t border-[var(--border)] px-2.5 py-2.5">
          <Row label="Ofsted">
            <Seg
              value={filters.rating}
              onChange={(v) => set({ rating: v as SchoolFilters["rating"] })}
              options={[
                { value: "any", label: "Any" },
                { value: "good", label: "Good +" },
                { value: "outstanding", label: "Outstanding" },
              ]}
            />
          </Row>
          {avail.genders.length >= 2 && (
            <Row label="Gender">
              <Seg
                value={filters.gender}
                onChange={(v) => set({ gender: v as SchoolFilters["gender"] })}
                options={[{ value: "any", label: "Any" }, ...avail.genders.map((g) => ({ value: g, label: g }))]}
              />
            </Row>
          )}
          {avail.hasFaith && (
            <Row label="Faith">
              <Seg
                value={filters.faith}
                onChange={(v) => set({ faith: v as SchoolFilters["faith"] })}
                options={[
                  { value: "any", label: "Any" },
                  { value: "faith", label: "Faith" },
                  { value: "secular", label: "Non-faith" },
                ]}
              />
            </Row>
          )}
          {avail.hasSelective && (
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={filters.selective}
                onChange={(e) => set({ selective: e.target.checked })}
                className="h-3.5 w-3.5 accent-[var(--primary)]"
              />
              <span className="text-[var(--muted)]">Grammar (selective) only</span>
            </label>
          )}
          {(avail.kinds.special || avail.kinds.independent || avail.kinds.alternative) && (
            <Row label="Type">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {avail.kinds.special && (
                  <KindCheck label="Special" checked={filters.showSpecial} onChange={(v) => set({ showSpecial: v })} />
                )}
                {avail.kinds.independent && (
                  <KindCheck label="Independent" checked={filters.showIndependent} onChange={(v) => set({ showIndependent: v })} />
                )}
                {avail.kinds.alternative && (
                  <KindCheck label="Alt. provision" checked={filters.showAlternative} onChange={(v) => set({ showAlternative: v })} />
                )}
              </div>
            </Row>
          )}
        </div>
      </details>
    </div>
  );
}

function KindCheck({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-1.5 text-[var(--muted)]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 accent-[var(--primary)]"
      />
      <span>{label}</span>
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="w-14 shrink-0 text-[var(--muted)]">{label}</span>
      {children}
    </div>
  );
}

function Seg({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-[var(--border)]">
      {options.map((o, i) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`px-2 py-0.5 transition ${i > 0 ? "border-l border-[var(--border)]" : ""} ${
            value === o.value
              ? "bg-[var(--primary)] font-semibold text-white"
              : "bg-white text-[var(--muted)] hover:bg-slate-50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
