"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AreaReport } from "@/lib/types";
import CompareTable, { CompareRow } from "./CompareTable";

export default function Compare({ initialPostcodes }: { initialPostcodes: string[] }) {
  const [slots, setSlots] = useState<string[]>(padTo(initialPostcodes, 2));
  const [rows, setRows] = useState<CompareRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const ran = useRef(false);

  const run = useCallback(async (pcs: string[]) => {
    const list = pcs.map((s) => s.trim()).filter(Boolean).slice(0, 4);
    if (list.length === 0) return;
    setLoading(true);
    const settled = await Promise.all(
      list.map(async (pc): Promise<CompareRow> => {
        try {
          const res = await fetch(`/api/area?postcode=${encodeURIComponent(pc)}&radius=1`);
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || "Failed");
          return { pc, report: data as AreaReport, error: null };
        } catch (e) {
          return { pc, report: null, error: e instanceof Error ? e.message : "Failed" };
        }
      }),
    );
    setRows(settled);
    setLoading(false);
    const qs = new URLSearchParams({ postcodes: list.join(",") });
    window.history.replaceState(null, "", `/compare?${qs.toString()}`);
  }, []);

  useEffect(() => {
    if (!ran.current && initialPostcodes.length) {
      ran.current = true;
      run(initialPostcodes);
    }
  }, [initialPostcodes, run]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight">Compare areas</h1>
      <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">
        Enter 2–4 UK postcodes. Schools, crime, property prices, and deprivation are lined up side
        by side, with the strongest in each row highlighted.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(slots);
        }}
        className="mt-4 flex flex-wrap items-center gap-2"
      >
        {slots.map((v, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              value={v}
              onChange={(e) => setSlots((s) => s.map((x, idx) => (idx === i ? e.target.value : x)))}
              placeholder={`Postcode ${i + 1}`}
              aria-label={`Postcode ${i + 1}`}
              className="w-36 rounded-xl border border-[var(--border)] bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-indigo-100"
            />
            {slots.length > 2 && (
              <button
                type="button"
                onClick={() => setSlots((s) => s.filter((_, idx) => idx !== i))}
                aria-label={`Remove postcode ${i + 1}`}
                className="px-1 text-lg leading-none text-[var(--muted)] hover:text-red-600"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {slots.length < 4 && (
          <button
            type="button"
            onClick={() => setSlots((s) => [...s, ""])}
            className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2.5 text-sm text-[var(--muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            + Add
          </button>
        )}
        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--primary-600)] disabled:opacity-60"
        >
          {loading ? "Comparing…" : "Compare"}
        </button>
        <a href="/" className="text-sm text-[var(--muted)] transition hover:text-[var(--primary)]">
          ← Single area
        </a>
      </form>

      {loading && (
        <p className="mt-6 text-sm text-[var(--muted)]">Fetching live data for each area…</p>
      )}
      {rows && !loading && <CompareTable rows={rows} />}
    </div>
  );
}

function padTo(arr: string[], min: number): string[] {
  const out = arr.slice(0, 4);
  while (out.length < min) out.push("");
  return out;
}
