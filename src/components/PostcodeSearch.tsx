"use client";

import { useRef, useState } from "react";
import { SchoolMatch } from "@/lib/types";

const EXAMPLES = ["SW11 6QT", "LS6 3HN", "S11 9AR", "L18 1JU"];
// Full or partial UK postcode - if it looks like one, we run an area search rather than name search.
const POSTCODE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/;

export default function PostcodeSearch({
  onSearch,
  onPickSchool,
  loading,
  large = false,
}: {
  onSearch: (postcode: string) => void;
  onPickSchool: (m: SchoolMatch) => void;
  loading: boolean;
  large?: boolean;
}) {
  const [value, setValue] = useState("");
  const [matches, setMatches] = useState<SchoolMatch[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctrl = useRef<AbortController | null>(null);

  function change(v: string) {
    setValue(v);
    setActive(0);
    const t = v.trim();
    if (timer.current) clearTimeout(timer.current);
    if (POSTCODE.test(t) || t.length < 3) {
      setMatches([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      try {
        const res = await fetch(`/api/school-search?q=${encodeURIComponent(t)}`, { signal: ctrl.current.signal });
        const data = await res.json();
        setMatches(data.results ?? []);
        setOpen(true);
      } catch {
        /* aborted/stale */
      }
    }, 180);
  }

  function pickSchool(m: SchoolMatch) {
    setValue(m.name);
    setMatches([]);
    setOpen(false);
    onPickSchool(m);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    if (POSTCODE.test(t)) {
      setOpen(false);
      onSearch(t);
    } else if (matches.length) {
      pickSchool(matches[Math.min(active, matches.length - 1)]);
    } else {
      onSearch(t); // fallback: let the area lookup try to geocode it
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !matches.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function pick(pc: string) {
    setValue(pc);
    setOpen(false);
    onSearch(pc);
  }

  return (
    <div className="w-full">
      <form onSubmit={submit} className="relative flex gap-2">
        <div className="relative flex-1">
          <input
            value={value}
            onChange={(e) => change(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => matches.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder="Enter a UK postcode or a school name"
            aria-label="UK postcode or school name"
            autoComplete="off"
            className={`w-full rounded-xl border border-[var(--border)] bg-white px-4 shadow-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-indigo-100 ${
              large ? "py-3.5 text-base" : "py-2.5 text-sm"
            }`}
          />
          {open && matches.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-[var(--border)] bg-white py-1 shadow-lg">
              {matches.map((m, i) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pickSchool(m);
                    }}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left ${
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
        <button
          type="submit"
          disabled={loading}
          className={`rounded-xl bg-[var(--primary)] px-5 font-semibold text-white shadow-sm transition hover:bg-[var(--primary-600)] disabled:opacity-60 ${
            large ? "py-3.5 text-base" : "py-2.5 text-sm"
          }`}
        >
          {loading ? "Searching…" : "Search"}
        </button>
      </form>

      {large && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
          <span>Try:</span>
          {EXAMPLES.map((pc) => (
            <button
              key={pc}
              type="button"
              onClick={() => pick(pc)}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 font-medium text-[var(--foreground)] shadow-sm transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              {pc}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
