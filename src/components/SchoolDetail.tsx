"use client";

import { OfstedRating, School } from "@/lib/types";
import { RATING_COLORS, RATING_LABELS } from "@/lib/ratings";
import { gradeColor, happyColor, p8Color, pctColor, progressColor } from "@/lib/scoreColors";
import { dfePerformanceUrl, ofstedReportUrl, parentViewUrl } from "@/lib/links";

const SUB: { key: keyof NonNullable<School["ofstedSub"]>; label: string }[] = [
  { key: "education", label: "Quality of education" },
  { key: "behaviour", label: "Behaviour & attitudes" },
  { key: "personal", label: "Personal development" },
  { key: "leadership", label: "Leadership & management" },
  { key: "eyfs", label: "Early years" },
  { key: "sixthForm", label: "Sixth form" },
];

// Ofsted Parent View statements (exact wording, from the MI workbook). naLabel explains the
// "Not applicable" share that Q4/Q6 carry; for those, pos/neg are measured among the rest.
const PV_QUESTIONS: { id: string; text: string; naLabel?: string }[] = [
  { id: "1", text: "My child is happy at this school." },
  { id: "2", text: "My child feels safe at this school." },
  { id: "3", text: "The school makes sure its pupils are well behaved." },
  { id: "4", text: "My child has been bullied and the school dealt with the bullying quickly and effectively.", naLabel: "child has not been bullied" },
  { id: "5", text: "The school makes me aware of what my child will learn during the year." },
  { id: "6", text: "When I have raised concerns with the school they have been dealt with properly.", naLabel: "no concerns raised" },
  { id: "8", text: "The school has high expectations for my child." },
  { id: "9", text: "My child does well at this school." },
  { id: "10", text: "The school lets me know how my child is doing." },
  { id: "11", text: "There is a good range of subjects available to my child at this school." },
  { id: "12", text: "My child can take part in clubs and activities at this school." },
  { id: "13", text: "The school supports my child's wider personal development." },
];
const PV_SEND_TEXT =
  "My child has SEND, and the school gives them the support they need to succeed.";

type PvRowData = { id: string; text: string; pos: number; neg?: number; note?: string };

// Flatten a school's Parent View into ordered rows for the breakdown list, injecting the SEND
// question (Q7b, with its Q7a prevalence note) before Q8 and the would-recommend question last.
function pvRows(pv: NonNullable<School["parentView"]>): PvRowData[] {
  const rows: PvRowData[] = [];
  for (const def of PV_QUESTIONS) {
    if (def.id === "8") {
      const send = pv["7b"];
      if (send?.pos != null) {
        const prev = pv["7a"]?.yes;
        rows.push({
          id: "7b",
          text: PV_SEND_TEXT,
          pos: send.pos,
          neg: send.neg,
          note: prev != null ? `Among the ${prev}% of parents who report their child has SEND` : undefined,
        });
      }
    }
    const d = pv[def.id];
    if (!d || d.pos == null) continue;
    rows.push({
      id: def.id,
      text: def.text,
      pos: d.pos,
      neg: d.neg,
      note: def.naLabel && d.na != null ? `Not applicable for ${d.na}% — ${def.naLabel}` : undefined,
    });
  }
  const rec = pv["14"];
  if (rec?.pos != null) {
    rows.push({ id: "14", text: "I would recommend this school to another parent.", pos: rec.pos, neg: 100 - rec.pos });
  }
  return rows;
}

export default function SchoolDetail({ school: s, onClose }: { school: School; onClose: () => void }) {
  const color = RATING_COLORS[s.ofsted];
  const year = s.ofstedDate ? Number(s.ofstedDate.slice(0, 4)) : null;
  const stale = year != null && new Date().getFullYear() - year > 4;
  const sub = s.ofstedSub ?? {};
  const reportUrl = s.urn ? ofstedReportUrl(s.urn) : s.ofstedReport;
  const dfeHref = s.urn ? dfePerformanceUrl(s.urn) : undefined;
  const nameHref = dfeHref ?? s.ofstedReport; // nurseries have no DfE link; use their Ofsted report
  const hasKs4 =
    s.progress8 != null || s.attainment8 != null || s.gcse5EM != null || s.ebaccEntry != null;
  const al = s.alevel ?? null;
  const hasAlevel = !!al && (al.grade != null || al.aps != null);
  const ks2 = s.ks2;
  const hasKs2 = !!ks2 && (ks2.rwmExp != null || ks2.readProg != null);
  const dest = s.destinations;
  const hasDest = !!dest && !!(dest.ks4 || dest.ks5);
  const comp = s.composition;
  const hasComp =
    !!comp && (comp.fsm != null || comp.eal != null || comp.senEhcp != null || comp.senSupport != null);
  const hasWorkforce = s.pupilTeacherRatio != null || s.teachersFte != null;
  const hasFinance = s.financePerPupil != null || s.financeReserve != null;
  const pv = s.parentView ?? null;
  const pvList = pv ? pvRows(pv) : [];
  const recommend = pv?.["14"]?.pos;
  const ageRange = s.ageLow != null && s.ageHigh != null ? `${s.ageLow}–${s.ageHigh}` : null;
  const hasDetails = !!(s.type || s.pupils != null || s.gender || s.religion || ageRange || s.selective);

  return (
    <div className="fixed inset-0 z-[2000] flex justify-end" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-[var(--background)] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-[var(--border)] bg-white px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold leading-tight">
              {nameHref ? (
                <a
                  href={nameHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-[var(--primary)] hover:underline"
                  title={dfeHref ? "DfE — compare school performance" : "Ofsted report"}
                >
                  {s.name}
                </a>
              ) : (
                s.name
              )}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--muted)]">
              {[s.phase, s.places ? `${s.places} places` : null, `${s.distanceMiles} mi away`]
                .filter(Boolean)
                .join(" · ")}
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
          {hasDetails && (
            <Section title="Details">
              <dl className="space-y-1.5 text-sm">
                {s.type && <Fact label="Type" value={s.type} />}
                {ageRange && <Fact label="Ages" value={ageRange} />}
                {s.pupils != null && <Fact label="Pupils" value={s.pupils.toLocaleString()} />}
                {s.gender && <Fact label="Gender" value={s.gender} />}
                {s.religion && <Fact label="Faith" value={s.religion} />}
                {s.selective && <Fact label="Admissions" value="Selective (11+)" />}
              </dl>
            </Section>
          )}

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
            {s.phase === "Nursery" && (
              <p className="mt-3 text-[11px] leading-snug text-[var(--muted)]">
                Grade is from Ofsted’s bulk data. Their new report cards (from Nov 2025) aren’t
                published in bulk yet, so a recent re-inspection may not show here — open the live
                report to check.
              </p>
            )}
            {reportUrl && (
              <a
                href={reportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-sm font-medium text-[var(--primary)] hover:underline"
              >
                {s.phase === "Nursery" ? "View live Ofsted report →" : "View Ofsted report →"}
              </a>
            )}
          </Section>

          {hasKs4 && (
            <Section title={`GCSE results${s.ks4Year ? ` · ${s.ks4Year}` : ""}`} href={dfeHref}>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <Stat label="Grade 5+ Eng & Maths" value={pct(s.gcse5EM)} color={tint(s.gcse5EM, pctColor)} />
                <Stat label="Grade 4+ Eng & Maths" value={pct(s.gcse4EM)} color={tint(s.gcse4EM, pctColor)} />
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

          {hasAlevel && al && (
            <Section title={`A-level results${al.year ? ` · ${al.year}` : ""}`} href={dfeHref}>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <Stat
                  label="Average grade"
                  value={al.grade ?? "—"}
                  color={al.grade ? gradeColor(al.grade) : undefined}
                />
                <Stat label="Points per entry" value={al.aps != null ? al.aps.toFixed(2) : "—"} />
                <Stat label="AAB+ (2 facilitating)" value={pct(al.aabFac)} />
                <Stat label="A-level cohort" value={al.pupils != null ? String(al.pupils) : "—"} />
              </div>
            </Section>
          )}

          {hasKs2 && ks2 && (
            <Section title={`KS2 results${ks2.year ? ` · ${ks2.year}` : ""}`} href={dfeHref}>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <Stat label="Expected in RWM" value={pct(ks2.rwmExp)} color={tint(ks2.rwmExp, pctColor)} />
                <Stat label="Higher in RWM" value={pct(ks2.rwmHigh)} color={tint(ks2.rwmHigh, pctColor)} />
                <Stat label="Reading progress" value={signed(ks2.readProg)} color={tint(ks2.readProg, progressColor)} />
                <Stat label="Writing progress" value={signed(ks2.writProg)} color={tint(ks2.writProg, progressColor)} />
                <Stat label="Maths progress" value={signed(ks2.matProg)} color={tint(ks2.matProg, progressColor)} />
              </div>
            </Section>
          )}

          {hasDest && dest && (
            <Section title="Destinations" href={dfeHref}>
              {dest.ks4 && (
                <>
                  <p className="text-xs font-semibold text-[var(--muted)]">After GCSEs (KS4)</p>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2">
                    <Stat label="Sustained" value={pct(dest.ks4.sustained)} color={tint(dest.ks4.sustained, pctColor)} />
                    <Stat label="Education" value={pct(dest.ks4.education)} />
                    <Stat label="Apprenticeship" value={pct(dest.ks4.appren)} />
                    <Stat label="Employment" value={pct(dest.ks4.employment)} />
                    <Stat label="Not sustained" value={pct(dest.ks4.notSustained)} />
                  </div>
                </>
              )}
              {dest.ks5 && (
                <div className={dest.ks4 ? "mt-3" : ""}>
                  <p className="text-xs font-semibold text-[var(--muted)]">After sixth form (KS5)</p>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-2">
                    <Stat label="Sustained" value={pct(dest.ks5.sustained)} color={tint(dest.ks5.sustained, pctColor)} />
                    <Stat label="University" value={pct(dest.ks5.he)} color={tint(dest.ks5.he, pctColor)} />
                    <Stat label="Further education" value={pct(dest.ks5.fe)} />
                    <Stat label="Apprenticeship" value={pct(dest.ks5.appren)} />
                    <Stat label="Employment" value={pct(dest.ks5.employment)} />
                  </div>
                </div>
              )}
            </Section>
          )}

          {hasComp && comp && (
            <Section title="Pupil composition" href={dfeHref}>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Stat label="FSM (last 6 yrs)" value={pct(comp.fsm)} />
                <Stat label="EAL" value={pct(comp.eal)} />
                <Stat label="SEN — EHC plan" value={pct(comp.senEhcp)} />
                <Stat label="SEN support" value={pct(comp.senSupport)} />
              </div>
            </Section>
          )}

          {hasWorkforce && (
            <Section title={`Workforce${s.workforceYear ? ` · ${s.workforceYear}` : ""}`}>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <Stat
                  label="Pupil:teacher ratio"
                  value={s.pupilTeacherRatio != null ? String(s.pupilTeacherRatio) : "—"}
                />
                <Stat
                  label="Teachers (FTE)"
                  value={s.teachersFte != null ? s.teachersFte.toFixed(1) : "—"}
                />
                <Stat
                  label="Total staff (FTE)"
                  value={s.staffFte != null ? s.staffFte.toFixed(1) : "—"}
                />
              </div>
            </Section>
          )}

          {hasFinance && (
            <Section title={`Finances${s.financeYear ? ` · ${s.financeYear}` : ""}`}>
              <div className="grid grid-cols-2 gap-x-3 gap-y-3">
                <Stat
                  label="Spend per pupil"
                  value={s.financePerPupil != null ? gbp(s.financePerPupil) : "—"}
                />
                <Stat
                  label="Revenue reserve"
                  value={s.financeReserve != null ? gbp(s.financeReserve) : "—"}
                  color={balanceColor(s.financeReserve)}
                />
                <Stat
                  label="In-year balance"
                  value={s.financeInYear != null ? gbp(s.financeInYear) : "—"}
                  color={balanceColor(s.financeInYear)}
                />
              </div>
              <p className="mt-2 text-[11px] leading-snug text-[var(--muted)]">
                Revenue reserve is the surplus (green) or deficit (red) carried forward.
              </p>
            </Section>
          )}

          {typeof s.parentViewHappy === "number" && (
            <Section
              title="Parent View"
              href={s.urn ? parentViewUrl(s.urn) : undefined}
              linkTitle="Ofsted Parent View — read parent reviews"
            >
              <div className="flex flex-wrap items-end gap-x-8 gap-y-2">
                <div>
                  {s.urn ? (
                    <a
                      href={parentViewUrl(s.urn)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-2xl font-bold leading-none hover:underline"
                      style={{ color: happyColor(s.parentViewHappy) }}
                    >
                      {s.parentViewHappy}%
                    </a>
                  ) : (
                    <span className="text-2xl font-bold leading-none" style={{ color: happyColor(s.parentViewHappy) }}>
                      {s.parentViewHappy}%
                    </span>
                  )}
                  <p className="mt-1.5 text-xs text-[var(--muted)]">agree their child is happy</p>
                </div>
                {recommend != null && (
                  <div>
                    <span className="text-2xl font-bold leading-none" style={{ color: happyColor(recommend) }}>
                      {recommend}%
                    </span>
                    <p className="mt-1.5 text-xs text-[var(--muted)]">would recommend</p>
                  </div>
                )}
              </div>
              {s.parentViewResponses != null && (
                <p className="mt-2 text-xs text-[var(--muted)]">{s.parentViewResponses} responses</p>
              )}

              {pvList.length > 0 && (
                <details className="group mt-3 border-t border-[var(--border)] pt-3">
                  <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-[var(--primary)] hover:underline">
                    <span className="text-[10px] transition-transform group-open:rotate-90" aria-hidden>▶</span>
                    All survey questions
                  </summary>
                  <ul className="mt-3 space-y-3">
                    {pvList.map((row) => (
                      <PvRow key={row.id} text={row.text} pos={row.pos} neg={row.neg} note={row.note} />
                    ))}
                  </ul>
                  <p className="mt-3 text-[11px] leading-snug text-[var(--muted)]">
                    Bars show parents who agree (green) vs. disagree (red); the gap is “don’t know”.
                  </p>
                </details>
              )}
            </Section>
          )}

          <p className="text-[11px] leading-relaxed text-[var(--muted)]">
            Coming next: catchment area and multi-year trends. Sources: GIAS, DfE performance
            tables, School Workforce Census, school finance (CFR/AAR), Ofsted, postcodes.io.
          </p>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  href,
  linkTitle = "DfE — compare school performance",
  children,
}: {
  title: string;
  href?: string;
  linkTitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <h3 className="mb-2 text-sm font-semibold tracking-tight">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline"
            title={linkTitle}
          >
            {title}
            <span aria-hidden className="text-[10px]">↗</span>
          </a>
        ) : (
          title
        )}
      </h3>
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function PvRow({ text, pos, neg, note }: { text: string; pos: number; neg?: number; note?: string }) {
  return (
    <li className="space-y-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs leading-snug">{text}</span>
        <span className="shrink-0 text-xs font-semibold tabular-nums" style={{ color: happyColor(pos) }}>
          {pos}%
        </span>
      </div>
      <PvBar pos={pos} neg={neg} />
      {note && <p className="text-[11px] leading-snug text-[var(--muted)]">{note}</p>}
    </li>
  );
}

function PvBar({ pos, neg = 0 }: { pos: number; neg?: number }) {
  const neutral = Math.max(0, 100 - pos - neg);
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden>
      <div style={{ width: `${pos}%`, backgroundColor: "#16a34a" }} />
      <div style={{ width: `${neutral}%` }} />
      <div style={{ width: `${neg}%`, backgroundColor: "#dc2626" }} />
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
function gbp(n: number): string {
  const v = Math.round(n);
  return (v < 0 ? "−£" : "£") + Math.abs(v).toLocaleString();
}
function balanceColor(v: number | null | undefined): string | undefined {
  return v == null ? undefined : v >= 0 ? "#16a34a" : "#dc2626";
}
function tint(v: number | null | undefined, fn: (n: number) => string): string | undefined {
  return v == null ? undefined : fn(v);
}
