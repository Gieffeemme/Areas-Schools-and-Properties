"use client";

import { useState } from "react";
import AreasCompare from "./AreasCompare";
import SchoolsCompare from "./SchoolsCompare";

type Mode = "areas" | "schools";

export default function Compare({
  initialMode,
  initialPostcodes,
  initialSchools,
}: {
  initialMode: Mode;
  initialPostcodes: string[];
  initialSchools: string[];
}) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Compare areas or schools side by side</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
        Choose what to compare, then line up 2-4 of them - the strongest in each row is highlighted.
      </p>

      <div
        role="tablist"
        aria-label="Compare mode"
        className="mt-4 inline-flex rounded-xl border border-[var(--border)] bg-white p-1 shadow-sm"
      >
        {(["areas", "schools"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              mode === m
                ? "bg-[var(--primary)] text-white shadow-sm"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {m === "areas" ? "Areas" : "Schools"}
          </button>
        ))}
      </div>

      {mode === "areas" ? (
        <AreasCompare initialPostcodes={initialPostcodes} />
      ) : (
        <SchoolsCompare initialSchools={initialSchools} />
      )}

      <p className="mt-8">
        <a href="/" className="text-sm text-[var(--muted)] transition hover:text-[var(--primary)]">
          ← Back to search
        </a>
      </p>
    </div>
  );
}
