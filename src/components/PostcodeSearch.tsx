"use client";

import { useRef, useState } from "react";
import { PlaceMatch, SchoolMatch } from "@/lib/types";

const EXAMPLES = ["SW11 6QT", "Leeds", "Harrogate", "S11 9AR"];
// Full or partial UK postcode - if it looks like one, we run an area search rather than name search.
const POSTCODE = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/;

type Suggestion =
  | { kind: "place"; place: PlaceMatch }
  | { kind: "school"; school: SchoolMatch };

export default function PostcodeSearch({
  onSearch,
  onPickSchool,
  onPickPlace,
  loading,
  large = false,
}: {
  onSearch: (postcode: string) => void;
  onPickSchool: (m: SchoolMatch) => void;
  onPickPlace: (p: PlaceMatch) => void;
  loading: boolean;
  large?: boolean;
}) {
  const [value, setValue] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
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
      setItems([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      ctrl.current?.abort();
      ctrl.current = new AbortController();
      const sig = ctrl.current.signal;
      const q = encodeURIComponent(t);
      // Places and schools in parallel; one failing still shows the other.
      const [places, schools] = await Promise.all([
        fetch(`/api/place-search?q=${q}`, { signal: sig }).then((r) => r.json()).then((d) => d.results ?? []).catch(() => []),
        fetch(`/api/school-search?q=${q}`, { signal: sig }).then((r) => r.json()).then((d) => d.results ?? []).catch(() => []),
      ]);
      if (sig.aborted) return;
      const next: Suggestion[] = [
        ...(places as PlaceMatch[]).slice(0, 4).map((p) => ({ kind: "place" as const, place: p })),
        ...(schools as SchoolMatch[]).slice(0, 6).map((s) => ({ kind: "school" as const, school: s })),
      ];
      setItems(next);
      setOpen(next.length > 0);
    }, 180);
  }

  function pick(it: Suggestion) {
    if (it.kind === "place") {
      setValue(it.place.name);
      onPickPlace(it.place);
    } else {
      setValue(it.school.name);
      onPickSchool(it.school);
    }
    setItems([]);
    setOpen(false);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = value.trim();
    if (!t) return;
    if (POSTCODE.test(t)) {
      setOpen(false);
      onSearch(t);
    } else if (items.length) {
      pick(items[Math.min(active, items.length - 1)]);
    } else {
      onSearch(t); // fallback: the area lookup geocodes a postcode OR a place name
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || !items.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  function quick(s: string) {
    setValue(s);
    setOpen(false);
    onSearch(s);
  }

  return (
    <div className="w-full">
      <form onSubmit={submit} className="relative flex gap-2">
        <div className="relative flex-1">
          <input
            value={value}
            onChange={(e) => change(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => items.length && setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            placeholder="Postcode, school, or place (e.g. Leeds)"
            aria-label="UK postcode, school name, or place"
            autoComplete="off"
            className={`w-full rounded-xl border border-[var(--border)] bg-white px-4 shadow-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-indigo-100 ${
              large ? "py-3.5 text-base" : "py-2.5 text-sm"
            }`}
          />
          {open && items.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-[var(--border)] bg-white py-1 shadow-lg">
              {items.map((it, i) => {
                const key = it.kind === "place" ? `p:${it.place.id}` : `s:${it.school.id}`;
                return (
                  <li key={key}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pick(it);
                      }}
                      onMouseEnter={() => setActive(i)}
                      className={`flex w-full items-baseline justify-between gap-3 px-4 py-2 text-left ${
                        i === active ? "bg-indigo-50" : "hover:bg-slate-50"
                      }`}
                    >
                      {it.kind === "place" ? (
                        <>
                          <span className="min-w-0 truncate text-sm font-medium">{it.place.name}</span>
                          <span className="shrink-0 text-xs text-[var(--muted)]">
                            {["Place", it.place.area].filter(Boolean).join(" · ")}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="min-w-0 truncate text-sm font-medium">{it.school.name}</span>
                          <span className="shrink-0 text-xs text-[var(--muted)]">
                            {[it.school.phase, it.school.postcode].filter(Boolean).join(" · ")}
                          </span>
                        </>
                      )}
                    </button>
                  </li>
                );
              })}
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
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => quick(ex)}
              className="rounded-full border border-[var(--border)] bg-white px-3 py-1 font-medium text-[var(--foreground)] shadow-sm transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
            >
              {ex}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
