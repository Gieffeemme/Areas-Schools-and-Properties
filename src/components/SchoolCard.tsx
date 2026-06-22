import { OfstedRating, School } from "@/lib/types";
import { RATING_COLORS } from "@/lib/ratings";
import { happyColor, p8Color } from "@/lib/scoreColors";
import { dfePerformanceUrl } from "@/lib/links";
import Pill from "./Pill";

const OFSTED_SHORT: Record<OfstedRating, string> = {
  Outstanding: "Outstanding",
  Good: "Good",
  "Requires improvement": "RI",
  Inadequate: "Inadequate",
  "Not rated": "Not rated",
  "Not loaded": "—",
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
  const color = RATING_COLORS[s.ofsted];
  const year = s.ofstedDate ? Number(s.ofstedDate.slice(0, 4)) : null;
  const stale = year != null && new Date().getFullYear() - year > 4;
  // Schools link to DfE compare-school-performance; nurseries (no DfE URN) to their Ofsted report.
  const nameHref = s.urn ? dfePerformanceUrl(s.urn) : s.ofstedReport;
  const nameTitle = s.urn ? "DfE — compare school performance" : "Ofsted report";

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
      style={{ borderLeftColor: color }}
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
        <Pill color={color} title={`Ofsted: ${s.ofsted}`}>
          {OFSTED_SHORT[s.ofsted] ?? s.ofsted}
        </Pill>
        {typeof s.progress8 === "number" && (
          <Pill color={p8Color(s.progress8)} title={`Progress 8${s.ks4Year ? ` (${s.ks4Year})` : ""}`}>
            P8 {s.progress8 > 0 ? "+" : ""}
            {s.progress8.toFixed(2)}
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
