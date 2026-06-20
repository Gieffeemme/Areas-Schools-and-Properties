"use client";

import { OfstedRating, School } from "@/lib/types";
import { RATING_COLORS, RATING_LABELS } from "@/lib/ratings";
import { happyColor, p8Color, pctColor, progressColor } from "@/lib/scoreColors";

const SUB: { key: keyof NonNullable<School["ofstedSub"]>; label: string }[] = [
  { key: "education", label: "Quality of education" },
  { key: "behaviour", label: "Behaviour & attitudes" },
  { key: "personal", label: "Personal development" },
  { key: "leadership", label: "Leadership & management" },
  { key: "eyfs", label: "Early years" },
  { key: "sixthForm", label: "Sixth form" },
];

export default function SchoolDetail({ school: s, onClose }: { school: School; onClose: () => void }) {
  const color = RATING_COLORS[s.ofsted];
  const year = s.ofstedDate ? Number(s.ofstedDate.slice(0, 4)) : null;
  const stale = year != null && new Date().getFullYear() - year > 4;
  const sub = s.ofstedSub ?? {};
  const reportUrl = s.urn ? `https://reports.ofsted.gov.uk/provider/23/${s.urn}` : s.ofstedReport;
  const hasKs4 = s.progress8 != null || s.attainment8 != null || s.ebaccEntry != null;
  const ks2 = s.ks2;
  const hasKs2 = !!ks2 && (ks2.rwmExp != null || ks2.readProg != null);

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-[var(--background)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight">{s.name}</h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {[s.phase, `${s.distanceMiles} mi away`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-1 text-[var(--muted)] transition hover:bg-slate-100"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 p-5">
          <Section title="Ofsted">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-md px-2.5 py-1 text-sm font-semibold text-white"
                style={{ backgroundColor: color }}
              >
                {RATING_LABELS[s.ofsted]}
              </span>
              {year != null && (
                <span className={`text-xs ${stale ? "font-medium text-[#d97706]" : "text-[var(--muted)]"}`}>
                  inspected {year}
                  {stale ? " · ageing" : ""}
                </span>
              )}
            </div>
            {SUB.some((x) => sub[x.key]) && (
              <dl className="mt-3 space-y-1.5">
                {SUB.filter((x) => sub[x.key]).map((x) => (
                  <div key={x.key} className="flex items-center justify-between gap-2 text-sm">
                    <dt className="text-[var(--muted)]">{x.label}</dt>
                    <dd>
                      <GradeChip rating={sub[x.key] as OfstedRating} />
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            {reportUrl && (
              <a
                href={reportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-medium text-[var(--primary)] hover:underline"
              >
                View Ofsted report →
              </a>
            )}
          </Section>

          {hasKs4 && (
            <Section title={`GCSE results${s.ks4Year ? ` · ${s.ks4Year}` : ""}`}>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <Stat label="Progress 8" value={signed(s.progress8)} color={tint(s.progress8, p8Color)} />
                <Stat label="Attainment 8" value={s.attainment8 != null ? String(s.attainment8) : "—"} />
                <Stat label="EBacc entry" value={pct(s.ebaccEntry)} color={tint(s.ebaccEntry, pctColor)} />
                <Stat label="EBacc grades 9–4" value={pct(s.ebacc94)} color={tint(s.ebacc94, pctColor)} />
                <Stat
                  label="Progress 8 — disadvantaged"
                  value={signed(s.disadvantagedP8)}
                  color={tint(s.disadvantagedP8, p8Color)}
                />
              </div>
            </Section>
          )}

          {hasKs2 && ks2 && (
            <Section title={`KS2 results${ks2.year ? ` · ${ks2.year}` : ""}`}>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <Stat label="Expected in RWM" value={pct(ks2.rwmExp)} color={tint(ks2.rwmExp, pctColor)} />
                <Stat label="Higher in RWM" value={pct(ks2.rwmHigh)} color={tint(ks2.rwmHigh, pctColor)} />
                <Stat label="Reading progress" value={signed(ks2.readProg)} color={tint(ks2.readProg, progressColor)} />
                <Stat label="Writing progress" value={signed(ks2.writProg)} color={tint(ks2.writProg, progressColor)} />
                <Stat label="Maths progress" value={signed(ks2.matProg)} color={tint(ks2.matProg, progressColor)} />
              </div>
            </Section>
          )}

          {typeof s.parentViewHappy === "number" && (
            <Section title="Parent View">
              <p>
                <span className="text-2xl font-bold" style={{ color: happyColor(s.parentViewHappy) }}>
                  {s.parentViewHappy}%
                </span>{" "}
                <span className="text-sm text-[var(--muted)]">agree their child is happy here</span>
              </p>
              {s.parentViewResponses != null && (
                <p className="mt-1 text-xs text-[var(--muted)]">{s.parentViewResponses} responses</p>
              )}
            </Section>
          )}

          <p className="text-[11px] leading-relaxed text-[var(--muted)]">
            Coming next: post-16 destinations and pupil composition (FSM / EAL / SEN). Sources:
            DfE performance tables &amp; Ofsted.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold tracking-tight">{title}</h3>
      {children}
    </section>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <p className="text-lg font-bold leading-none" style={color ? { color } : undefined}>
        {value}
      </p>
      <p className="mt-1 text-xs leading-snug text-[var(--muted)]">{label}</p>
    </div>
  );
}

function GradeChip({ rating }: { rating: OfstedRating }) {
  return (
    <span
      className="rounded px-2 py-0.5 text-[11px] font-semibold text-white"
      style={{ backgroundColor: RATING_COLORS[rating] }}
    >
      {RATING_LABELS[rating]}
    </span>
  );
}

function signed(v: number | null | undefined): string {
  return v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
}
function pct(v: number | null | undefined): string {
  return v == null ? "—" : `${v}%`;
}
function tint(v: number | null | undefined, fn: (n: number) => string): string | undefined {
  return v == null ? undefined : fn(v);
}
