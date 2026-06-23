import { CensusSummary } from "@/lib/types";
import Card from "./Card";
import SourceLink from "./SourceLink";
import { censusSourceUrl } from "@/lib/sources";

// "Who lives here" - Census 2021 demographics for the neighbourhood (LSOA), from ONS via Nomis.
// England & Wales only; null off-coverage (the panel is hidden by the dashboard there).
export default function DemographicsPanel({ census }: { census: CensusSummary | null }) {
  if (!census) {
    return (
      <Card title="Who lives here" subtitle="Census 2021 · ONS">
        <p className="text-sm text-[var(--muted)]">
          Census 2021 demographics are temporarily unavailable for this neighbourhood.
        </p>
      </Card>
    );
  }
  const { age, tenure, economic, qualifications, household } = census;
  const bits = [
    census.population != null ? `${census.population.toLocaleString("en-GB")} residents` : null,
    census.households != null ? `${census.households.toLocaleString("en-GB")} households` : null,
  ].filter(Boolean);

  return (
    <Card title="Who lives here" subtitle={`Census 2021 · ${bits.join(" · ") || "ONS"}`}>
      <div className="space-y-3">
        {age && (
          <Row
            label="Age"
            value={`Median ${age.median ?? "-"} · ${pct(age.under15)} under 15 · ${pct(age.over65)} over 65`}
          >
            <AgeSparkline bands={age.bands} />
          </Row>
        )}

        {tenure && (
          <Row
            label="Tenure"
            value={`${pct(tenure.owned)} owned · ${pct(tenure.privateRented)} private rent · ${pct(tenure.socialRented)} social`}
          >
            <StackBar
              segs={[
                { label: "Owned", pct: tenure.owned, color: "#4338ca" },
                { label: "Private rented", pct: tenure.privateRented, color: "#818cf8" },
                { label: "Social rented", pct: tenure.socialRented, color: "#a5b4fc" },
                { label: "Other", pct: tenure.other, color: "#e0e7ff" },
              ]}
            />
          </Row>
        )}

        {economic && (
          <Row
            label="Work"
            value={`${pct(economic.inEmployment)} in employment · ${pct(economic.inactive)} economically inactive`}
          />
        )}

        {qualifications && (
          <Row
            label="Education"
            value={`${pct(qualifications.level4plus)} degree-level (L4+) · ${pct(qualifications.none)} no qualifications`}
          />
        )}

        {household && (
          <Row
            label="Households"
            value={`${pct(household.onePerson)} one-person · ${pct(household.family)} family · ${pct(household.other)} other`}
          >
            <StackBar
              segs={[
                { label: "One-person", pct: household.onePerson, color: "#818cf8" },
                { label: "Family", pct: household.family, color: "#4338ca" },
                { label: "Other", pct: household.other, color: "#c7d2fe" },
              ]}
            />
          </Row>
        )}
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
        Neighbourhood (LSOA) figures from the{" "}
        <SourceLink href={censusSourceUrl()}>ONS Census 2021</SourceLink>. England & Wales.
      </p>
    </Card>
  );
}

const pct = (n: number | null | undefined) => (n == null ? "-" : `${Math.round(n)}%`);

function Row({ label, value, children }: { label: string; value: string; children?: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 text-sm font-semibold leading-snug">{value}</p>
      {children}
    </div>
  );
}

function StackBar({ segs }: { segs: { label: string; pct: number; color: string }[] }) {
  return (
    <div className="mt-1.5 flex h-2.5 w-full overflow-hidden rounded-full" aria-hidden="true">
      {segs
        .filter((s) => s.pct > 0)
        .map((s) => (
          <div
            key={s.label}
            title={`${s.label}: ${Math.round(s.pct)}%`}
            style={{ width: `${s.pct}%`, backgroundColor: s.color }}
          />
        ))}
    </div>
  );
}

// The 5-year age bands as a tiny histogram (youngest left → oldest right).
function AgeSparkline({ bands }: { bands: { label: string; pct: number }[] }) {
  const max = Math.max(...bands.map((b) => b.pct), 1);
  return (
    <div className="mt-1.5 flex h-8 items-end gap-px" aria-hidden="true">
      {bands.map((b) => (
        <div
          key={b.label}
          title={`Aged ${b.label}: ${Math.round(b.pct)}%`}
          className="flex-1 rounded-sm"
          style={{ height: `${Math.max(6, (b.pct / max) * 100)}%`, backgroundColor: "#818cf8" }}
        />
      ))}
    </div>
  );
}
