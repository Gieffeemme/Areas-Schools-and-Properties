import { OfstedRating, School } from "@/lib/types";
import { gradeDisplay } from "@/lib/reportCard";
import { NATION_SCHOOL_INFO } from "@/lib/nations";
import { KIND_LABEL } from "@/lib/schoolFilters";
import { happyColor, p8Color, pctColor } from "@/lib/scoreColors";
import { dfePerformanceUrl } from "@/lib/links";
import Pill from "./Pill";

const KIND_NEUTRAL = "#64748b"; // slate - a category tag, not a quality colour

const OFSTED_SHORT: Record<OfstedRating, string> = {
  Outstanding: "Outstanding",
  Good: "Good",
  "Requires improvement": "RI",
  Inadequate: "Inadequate",
  "Not rated": "Not rated",
  "Not loaded": "-",
};

export default function SchoolCard({
  school: s,
  onClick,
  shortlisted = false,
  onToggleShortlist,
}: {
  school: School;
  onClick?: () => void;
  shortlisted?: boolean;
  onToggleShortlist?: () => void;
}) {
  const grade = gradeDisplay(s.reportCard, s.ofsted);
  // Non-England schools have no Ofsted grade (devolved inspectorates give no single judgement) - show
  // a neutral nation tag, never "Not rated", and surface non-English-medium teaching.
  const nation = s.nation ? NATION_SCHOOL_INFO[s.nation] : null;
  const langTag = ["Welsh medium", "Dual language", "Irish medium"].includes(s.language ?? "") ? s.language : null;
  // Independent schools are ISI-inspected (not Ofsted), so we hold no Ofsted grade - show
  // "Independent" rather than a misleading "Not rated". Special/alternative get a neutral type tag.
  const indie = !nation && s.kind === "independent" && (s.ofsted === "Not rated" || s.ofsted === "Not loaded");
  // Inspected since Sept 2024 with sub-judgements but no single overall grade - don't show "Not rated".
  const noOverall = !nation && !s.reportCard && !indie && !!s.ofstedNoOverall;
  const kindTag = s.kind && s.kind !== "independent" ? KIND_LABEL[s.kind] : null;
  const year = s.reportCard?.inspectionDate
    ? Number(s.reportCard.inspectionDate.slice(0, 4))
    : s.ofstedDate
      ? Number(s.ofstedDate.slice(0, 4))
      : null;
  const stale = !s.reportCard && year != null && new Date().getFullYear() - year > 4;
  // Schools link to DfE compare-school-performance; nurseries (no DfE URN) to their Ofsted report;
  // Welsh schools to My Local School.
  const nameHref = s.urn ? dfePerformanceUrl(s.urn) : s.ofstedReport;
  const nameTitle = s.urn ? "DfE - compare school performance" : nation ? `${nation.linkLabel} (${nation.short})` : "Ofsted report";

  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`rounded-lg border border-l-4 border-[var(--border)] bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        onClick ? "cursor-pointer" : ""
      }`}
      style={{ borderLeftColor: grade.colour }}
    >
      <div className="flex items-baseline justify-between gap-2">
        {nameHref ? (
          <a
            href={nameHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="min-w-0 truncate text-[15px] font-semibold leading-tight text-[var(--primary)] hover:underline"
            title={nameTitle}
          >
            {s.name}
          </a>
        ) : (
          <p className="min-w-0 truncate text-[15px] font-semibold leading-tight">{s.name}</p>
        )}
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-xs text-[var(--muted)]">{s.distanceMiles} mi</span>
          {onToggleShortlist && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleShortlist();
              }}
              aria-label={shortlisted ? "Remove from shortlist" : "Add to shortlist"}
              title={shortlisted ? "Remove from shortlist" : "Add to shortlist"}
              className={`text-base leading-none transition ${
                shortlisted ? "text-amber-500" : "text-slate-300 hover:text-amber-400"
              }`}
            >
              {shortlisted ? "★" : "☆"}
            </button>
          )}
        </div>
      </div>

      <p className="mt-0.5 text-xs text-[var(--muted)]">
        {s.phase ?? "School"}
        {s.pupils != null && ` · ${s.pupils.toLocaleString()} pupils`}
        {year != null && (
          <>
            {" · "}
            <span className={stale ? "font-medium text-[#d97706]" : ""}>Ofsted {year}</span>
          </>
        )}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Pill
          color={nation || indie || noOverall ? KIND_NEUTRAL : grade.colour}
          title={
            nation
              ? `${nation.short} school - inspected by ${nation.inspectorate} (no single grade); see ${nation.linkLabel}`
              : indie
                ? "Independent - inspected by ISI, not Ofsted"
                : noOverall
                  ? "Inspected since Sept 2024 - Ofsted no longer gives a single overall grade; see the detail"
                  : `Ofsted: ${grade.label}`
          }
        >
          {nation
            ? nation.short
            : indie
              ? "Independent"
              : noOverall
                ? "No overall"
                : grade.isReportCard
                  ? grade.label
                  : OFSTED_SHORT[s.ofsted] ?? s.ofsted}
        </Pill>
        {langTag && (
          <Pill color="#0d9488" title={`${langTag} school`}>
            {langTag}
          </Pill>
        )}
        {kindTag && (
          <Pill
            color={KIND_NEUTRAL}
            title={s.kind === "special" ? "Special school (SEND provision)" : "Alternative provision / PRU"}
          >
            {kindTag}
          </Pill>
        )}
        {typeof s.progress8 === "number" && (
          <Pill color={p8Color(s.progress8)} title={`Progress 8${s.ks4Year ? ` (${s.ks4Year})` : ""}`}>
            P8 {s.progress8 > 0 ? "+" : ""}
            {s.progress8.toFixed(2)}
          </Pill>
        )}
        {typeof s.gcse5EM === "number" && (
          <Pill color={pctColor(s.gcse5EM)} title={`GCSE grade 5+ in English & Maths${s.ks4Year ? ` (${s.ks4Year})` : ""}`}>
            GCSE {s.gcse5EM}%
          </Pill>
        )}
        {typeof s.parentViewHappy === "number" && (
          <Pill
            color={happyColor(s.parentViewHappy)}
            title={`Parent View happiness${s.parentViewResponses != null ? ` (${s.parentViewResponses} responses)` : ""}`}
          >
            {s.parentViewHappy}%
          </Pill>
        )}
      </div>
    </div>
  );
}
