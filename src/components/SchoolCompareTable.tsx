import { School } from "@/lib/types";
import { gbp } from "@/lib/format";
import RatingBadge from "./RatingBadge";
import { gradeDisplay, gradeRank, REPORT_CARD_COLOUR, REPORT_CARD_SHORT } from "@/lib/reportCard";

export default function SchoolCompareTable({
  schools,
  missing = [],
}: {
  schools: School[];
  missing?: string[];
}) {
  if (schools.length === 0) {
    return <p className="mt-6 text-sm text-red-700">None of those schools could be loaded.</p>;
  }

  const ofstedBest = argbestRank(schools.map((s) => gradeRank(s.reportCard, s.ofsted)));
  const gcse5Best = argbest(schools.map((s) => s.gcse5EM ?? null), "max");
  const p8Best = argbest(schools.map((s) => s.progress8 ?? null), "max");
  const att8Best = argbest(schools.map((s) => s.attainment8 ?? null), "max");
  const ks2Best = argbest(schools.map((s) => s.ks2?.rwmExp ?? null), "max");
  const alevelBest = argbest(schools.map((s) => s.alevel?.aps ?? null), "max");
  const pvBest = argbest(schools.map((s) => s.parentViewHappy ?? null), "max");

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-[var(--background)] p-3" />
            {schools.map((s) => (
              <th key={s.id} className="border-b border-[var(--border)] p-3 text-left align-bottom">
                {s.ofstedReport ? (
                  <a
                    href={s.ofstedReport}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-[var(--primary)] hover:underline"
                  >
                    {s.name}
                  </a>
                ) : (
                  <span className="font-bold">{s.name}</span>
                )}
                <div className="text-xs font-normal text-[var(--muted)]">{s.phase ?? "School"}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <MetricRow label="Type">
            {schools.map((s, i) => (
              <Td key={i}>{s.type ?? s.phase ?? <Muted />}</Td>
            ))}
          </MetricRow>

          <MetricRow label="Pupils / places">
            {schools.map((s, i) => (
              <Td key={i}>
                {s.pupils != null
                  ? s.pupils.toLocaleString()
                  : s.places != null
                    ? `${s.places} places`
                    : <Muted />}
              </Td>
            ))}
          </MetricRow>

          <MetricRow label="Ofsted">
            {schools.map((s, i) => (
              <Td key={i} best={i === ofstedBest}>
                {s.reportCard ? (
                  <span
                    title={s.reportCard.overallLabel}
                    className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold text-white"
                    style={{ backgroundColor: REPORT_CARD_COLOUR[s.reportCard.overall] }}
                  >
                    {REPORT_CARD_SHORT[s.reportCard.overall]}
                  </span>
                ) : (
                  <RatingBadge rating={s.ofsted} small />
                )}
              </Td>
            ))}
          </MetricRow>

          <MetricRow label="Inspected">
            {schools.map((s, i) => {
              const y = inspYear(s);
              return <Td key={i}>{y ?? <Muted />}</Td>;
            })}
          </MetricRow>

          <MetricRow label="GCSE grade 5+ E&M">
            {schools.map((s, i) => (
              <Td key={i} best={i === gcse5Best}>{pct(s.gcse5EM)}</Td>
            ))}
          </MetricRow>

          <MetricRow label="Progress 8">
            {schools.map((s, i) => (
              <Td key={i} best={i === p8Best}>{signed(s.progress8)}</Td>
            ))}
          </MetricRow>

          <MetricRow label="Attainment 8">
            {schools.map((s, i) => (
              <Td key={i} best={i === att8Best}>
                {s.attainment8 != null ? String(s.attainment8) : <Muted />}
              </Td>
            ))}
          </MetricRow>

          <MetricRow label="KS2 reading/writing/maths (expected)">
            {schools.map((s, i) => (
              <Td key={i} best={i === ks2Best}>{pct(s.ks2?.rwmExp)}</Td>
            ))}
          </MetricRow>

          <MetricRow label="A-level points / entry">
            {schools.map((s, i) => (
              <Td key={i} best={i === alevelBest}>
                {s.alevel?.aps != null ? s.alevel.aps.toFixed(2) : <Muted />}
              </Td>
            ))}
          </MetricRow>

          <MetricRow label="Parent View — happy">
            {schools.map((s, i) => (
              <Td key={i} best={i === pvBest}>{pct(s.parentViewHappy)}</Td>
            ))}
          </MetricRow>

          <MetricRow label="Pupil:teacher ratio">
            {schools.map((s, i) => (
              <Td key={i}>{s.pupilTeacherRatio != null ? String(s.pupilTeacherRatio) : <Muted />}</Td>
            ))}
          </MetricRow>

          <MetricRow label="Spend per pupil">
            {schools.map((s, i) => (
              <Td key={i}>{s.financePerPupil != null ? gbp(s.financePerPupil) : <Muted />}</Td>
            ))}
          </MetricRow>
        </tbody>
      </table>

      {missing.length > 0 && (
        <p className="mt-3 text-xs text-amber-700">Couldn’t load: {missing.join(", ")}.</p>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Green = strongest in the row. Many metrics apply only to certain phases (GCSE to secondaries,
        KS2 to primaries, etc.), so “—” means not applicable. Ofsted shows the new report-card band
        where one exists, otherwise the legacy grade.
      </p>
    </div>
  );
}

function MetricRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <th className="sticky left-0 z-10 border-b border-[var(--border)] bg-[var(--background)] p-3 text-left text-xs font-medium text-[var(--muted)]">
        {label}
      </th>
      {children}
    </tr>
  );
}

function Td({ children, best }: { children: React.ReactNode; best?: boolean }) {
  return (
    <td
      className={`border-b border-[var(--border)] p-3 align-top ${best ? "bg-emerald-50" : "bg-white"}`}
    >
      <div className="font-semibold">{children}</div>
      {best && (
        <span className="mt-1 inline-block rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
          best
        </span>
      )}
    </td>
  );
}

function Muted() {
  return <span className="text-[var(--muted)]">—</span>;
}

function inspYear(s: School): number | null {
  const d = s.reportCard?.inspectionDate ?? s.ofstedDate;
  return d ? Number(d.slice(0, 4)) : null;
}

function pct(v: number | null | undefined): React.ReactNode {
  return v == null ? <Muted /> : `${v}%`;
}

function signed(v: number | null | undefined): React.ReactNode {
  return v == null ? <Muted /> : `${v > 0 ? "+" : ""}${v.toFixed(2)}`;
}

function argbest(vals: (number | null)[], dir: "min" | "max"): number {
  let best = -1;
  let bestVal = dir === "min" ? Infinity : -Infinity;
  vals.forEach((v, i) => {
    if (v == null) return;
    if ((dir === "min" && v < bestVal) || (dir === "max" && v > bestVal)) {
      bestVal = v;
      best = i;
    }
  });
  return best;
}

// Best (lowest) grade rank; -1 if every school is unrated (rank 9), so nothing is highlighted.
function argbestRank(ranks: number[]): number {
  let best = -1;
  let bestVal = 9;
  ranks.forEach((r, i) => {
    if (r < bestVal) {
      bestVal = r;
      best = i;
    }
  });
  return best;
}
