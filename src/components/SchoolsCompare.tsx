"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { School, SchoolMatch } from "@/lib/types";
import SchoolCompareTable from "./SchoolCompareTable";
import SchoolSlotInput from "./SchoolSlotInput";

type Slot = SchoolMatch | null;

export default function SchoolsCompare({ initialSchools }: { initialSchools: string[] }) {
  const [slots, setSlots] = useState<Slot[]>(() => padSlots([]));
  const [schools, setSchools] = useState<School[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const ran = useRef(false);

  const fetchSchools = useCallback(async (ids: string[]): Promise<School[]> => {
    const list = ids.filter(Boolean).slice(0, 4);
    if (!list.length) return [];
    const res = await fetch(`/api/schools?ids=${encodeURIComponent(list.join(","))}`);
    const data = await res.json().catch(() => ({}));
    return res.ok ? (data.schools ?? []) : [];
  }, []);

  const run = useCallback(
    async (ids: string[]) => {
      const list = ids.filter(Boolean).slice(0, 4);
      if (!list.length) return;
      setLoading(true);
      const got = await fetchSchools(list);
      setSchools(got);
      const gotIds = new Set(got.map((s) => s.id));
      setMissing(list.filter((id) => !gotIds.has(id)));
      setLoading(false);
      const qs = new URLSearchParams({ mode: "schools", schools: list.join(",") });
      window.history.replaceState(null, "", `/compare?${qs.toString()}`);
    },
    [fetchSchools],
  );

  // Hydrate slots + results from ?schools= on first load.
  useEffect(() => {
    if (ran.current || !initialSchools.length) return;
    ran.current = true;
    (async () => {
      setLoading(true);
      const got = await fetchSchools(initialSchools);
      setSlots(
        padSlots(
          got.map((s) => ({ id: s.id, name: s.name, phase: s.phase, postcode: "", lat: s.lat, lng: s.lng })),
        ),
      );
      setSchools(got);
      setLoading(false);
    })();
  }, [initialSchools, fetchSchools]);

  const ids = slots.filter((s): s is SchoolMatch => !!s).map((s) => s.id);

  return (
    <>
      <p className="mt-4 max-w-2xl text-sm text-[var(--muted)]">
        Find 2-4 schools or nurseries by name, then line up their Ofsted, results, Parent View,
        workforce and finances side by side.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run(ids);
        }}
        className="mt-3 flex flex-wrap items-start gap-2"
      >
        {slots.map((slot, i) => (
          <div key={i} className="flex items-start gap-1">
            <SchoolSlotInput
              index={i}
              value={slot}
              onPick={(m) => setSlots((s) => s.map((x, idx) => (idx === i ? m : x)))}
            />
            {slots.length > 2 && (
              <button
                type="button"
                onClick={() => setSlots((s) => s.filter((_, idx) => idx !== i))}
                aria-label={`Remove school ${i + 1}`}
                className="px-1 py-2 text-lg leading-none text-[var(--muted)] hover:text-red-600"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {slots.length < 4 && (
          <button
            type="button"
            onClick={() => setSlots((s) => [...s, null])}
            className="rounded-xl border border-dashed border-[var(--border)] px-3 py-2.5 text-sm text-[var(--muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
          >
            + Add
          </button>
        )}
        <button
          type="submit"
          disabled={loading || ids.length === 0}
          className="rounded-xl bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--primary-600)] disabled:opacity-60"
        >
          {loading ? "Comparing…" : "Compare"}
        </button>
      </form>

      {loading && <p className="mt-6 text-sm text-[var(--muted)]">Loading schools…</p>}
      {schools && !loading && <SchoolCompareTable schools={schools} missing={missing} />}
    </>
  );
}

function padSlots(arr: Slot[]): Slot[] {
  const out: Slot[] = arr.slice(0, 4);
  while (out.length < 2) out.push(null);
  return out;
}
