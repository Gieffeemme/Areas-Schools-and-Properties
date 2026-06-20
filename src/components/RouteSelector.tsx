"use client";

import { ROUTES, Route } from "@/lib/routes";

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
            <span className="mr-1">{r.emoji}</span>
            {r.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {ROUTES.map((r) => {
        const active = value === r.id;
        return (
          <button
            key={r.id}
            onClick={() => onChange(r.id)}
            aria-pressed={active}
            className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
              active
                ? "border-[var(--primary)] ring-2 ring-indigo-100"
                : "border-[var(--border)] hover:border-[var(--primary)]"
            }`}
          >
            <div className="text-2xl">{r.emoji}</div>
            <div className="mt-2 font-semibold">{r.label}</div>
            <div className="mt-1 text-xs text-[var(--muted)]">{r.blurb}</div>
          </button>
        );
      })}
    </div>
  );
}
