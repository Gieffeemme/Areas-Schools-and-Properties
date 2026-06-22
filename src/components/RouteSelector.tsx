"use client";

import { ROUTES, Route } from "@/lib/routes";

const ICONS: Record<Route, React.ReactElement> = {
  area: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 6 3 4v14l6 2 6-2 6 2V6l-6-2-6 2Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  ),
  property: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.8V20h14V9.8" />
      <path d="M10 20v-5h4v5" />
    </svg>
  ),
};

export default function RouteSelector({
  value,
  onChange,
  variant = "cards",
}: {
  value: Route;
  onChange: (r: Route) => void;
  variant?: "cards" | "tabs";
}) {
  if (variant === "tabs") {
    return (
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-[var(--border)] bg-white p-1 shadow-sm">
        {ROUTES.map((r) => (
          <button
            key={r.id}
            onClick={() => onChange(r.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              value === r.id
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {ROUTES.map((r) => {
        const active = value === r.id;
        return (
          <button
            key={r.id}
            onClick={() => onChange(r.id)}
            aria-pressed={active}
            className={`rounded-2xl border bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
              active ? "border-[var(--primary)] ring-2 ring-indigo-100" : "border-[var(--border)]"
            }`}
          >
            <span
              className="grid h-11 w-11 place-items-center rounded-xl text-[var(--primary)]"
              style={{ backgroundColor: "#6366f114" }}
            >
              {ICONS[r.id]}
            </span>
            <div className="mt-3 text-base font-semibold">{r.label}</div>
            <div className="mt-1 text-sm leading-snug text-[var(--muted)]">{r.blurb}</div>
          </button>
        );
      })}
    </div>
  );
}
