"use client";

import { useEffect, useRef, useState } from "react";
import { SchoolMatch } from "@/lib/types";

// One compare slot: type a school name → typeahead suggestions (from /api/school-search) → pick one.
// Mirrors the home PostcodeSearch typeahead (debounce, abort, keyboard nav).
export default function SchoolSlotInput({
  index,
  value,
  onPick,
}: {
  index: number;
  value: SchoolMatch | null;
  onPick: (m: SchoolMatch | null) => void;
}) {
  const [q, setQ] = useState(value?.name ?? "");
  const [matches, setMatches] = useState<SchoolMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  // Sync the text when a selection arrives from outside (e.g. hydrated from the URL). Only on a real
  // selection — clearing (value=null) leaves whatever the user is typing intact.
  useEffect(() => {
    if (value) setQ(value.name);
  }, [value]);

  function change(v: string) {
    setQ(v);
    setActive(0);
    if (value) onPick(null); // editing a chosen slot clears the selection
    if (timer.current) clearTimeout(timer.current);
    const t = v.trim();
    if (t.length < 3) {
      setMatches([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      try {
        const res = await fetch(`/api/school-search?q=${encodeURIComponent(t)}`, {
          signal: ctrl.current.signal,
        });
        const data = await res.json();
        setMatches(data.results ?? []);
        setOpen(true);
      } catch {
        /* aborted/stale */
      }
    }, 180);
  }

  function pick(m: SchoolMatch) {
    setQ(m.name);
    setMatches([]);
    setOpen(false);
    onPick(m);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(matches[Math.min(active, matches.length - 1)]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative w-56">
      <input
        value={q}
        onChange={(e) => change(e.target.value)}
        onKeyDown={onKeyDown}
        onFocus={() => matches.length && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        placeholder={`School ${index + 1}`}
        aria-label={`School ${index + 1}`}
        autoComplete="off"
        className={`w-full rounded-xl border bg-white px-3 py-2.5 text-sm shadow-sm outline-none focus:border-[var(--primary)] focus:ring-2 focus:ring-indigo-100 ${
          value ? "border-[var(--primary)]" : "border-[var(--border)]"
        }`}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-20 mt-1 max-h-72 w-72 overflow-auto rounded-xl border border-[var(--border)] bg-white py-1 shadow-lg">
          {matches.map((m, i) => (
            <li key={m.id}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                onMouseEnter={() => setActive(i)}
                className={`flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left ${
                  i === active ? "bg-indigo-50" : "hover:bg-slate-50"
                }`}
              >
                <span className="min-w-0 truncate text-sm font-medium">{m.name}</span>
                <span className="shrink-0 text-xs text-[var(--muted)]">
                  {[m.phase, m.postcode].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
