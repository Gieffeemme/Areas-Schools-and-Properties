"use client";

import { useState } from "react";

const EXAMPLES = ["SW11 6QT", "LS6 3HN", "S11 9AR", "L18 1JU"];

export default function PostcodeSearch({
  onSearch,
  loading,
  large = false,
}: {
  onSearch: (postcode: string) => void;
  loading: boolean;
  large?: boolean;
}) {
  const [value, setValue] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = value.trim();
    if (v) onSearch(v);
  }

  function pick(pc: string) {
    setValue(pc);
    onSearch(pc);
  }

  return (
    <div className="w-full">
      <form onSubmit={submit} className="flex gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Enter a UK postcode, e.g. SW11 6QT"
          aria-label="UK postcode"
          autoComplete="postal-code"
          className={`flex-1 rounded-xl border border-[var(--border)] bg-white px-4 shadow-sm outline-none transition focus:border-[var(--primary)] focus:ring-2 focus:ring-indigo-100 ${
            large ? "py-3.5 text-base" : "py-2.5 text-sm"
          }`}
        />
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
