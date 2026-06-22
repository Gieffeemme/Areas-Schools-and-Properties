import { MetricBenchmark, PriceSummary } from "@/lib/types";
import { gbp } from "@/lib/format";
import Card from "./Card";

export default function PricePanel({
  prices,
  benchmark,
}: {
  prices: PriceSummary | null;
  benchmark?: MetricBenchmark | null;
}) {
  if (!prices) {
    return (
      <Card title="Property prices">
        <p className="text-sm text-[var(--muted)]">Land Registry data is temporarily unavailable.</p>
      </Card>
    );
  }

  if (prices.count === 0) {
    return (
      <Card title="Property prices" subtitle={prices.area}>
        <p className="text-sm text-[var(--muted)]">No recorded Land Registry sales near this postcode yet.</p>
        <Source />
      </Card>
    );
  }

  const years = prices.byYear;
  const maxMedian = Math.max(...years.map((y) => y.medianPrice), 1);
  const sector = prices.scope === "sector";

  return (
    <Card
      title="Property prices"
      subtitle={`${prices.area}${sector ? " sector" : ""} · ${prices.count} sales on record`}
    >
      <p className="text-3xl font-bold leading-none">{gbp(prices.medianPrice)}</p>
      <p className="mt-1 text-xs text-[var(--muted)]">median sold price (all on record)</p>
      {sector && (
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          Exact-postcode sales were sparse - showing the wider {prices.area} sector.
        </p>
      )}

      {benchmark && (
        <p className="mt-2 text-xs">
          This local authority is pricier than <strong>{benchmark.percentile}%</strong> of England.
        </p>
      )}

      {years.length > 1 && (
        <div className="mt-4 flex h-24 items-end gap-1.5">
          {years.map((y) => (
            <div
              key={y.year}
              className="flex flex-1 flex-col items-center gap-1"
              title={`${y.year}: ${gbp(y.medianPrice)} median · ${y.count} sale${y.count === 1 ? "" : "s"}`}
            >
              <div
                className="w-full rounded-t bg-indigo-300"
                style={{ height: `${Math.max(6, (y.medianPrice / maxMedian) * 72)}px` }}
              />
              <span className="text-[10px] text-[var(--muted)]">’{String(y.year).slice(2)}</span>
            </div>
          ))}
        </div>
      )}

      <ul className="mt-4 space-y-1.5 text-xs">
        {prices.sales.slice(0, 4).map((s, i) => (
          <li key={i} className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[var(--muted)]">
              {[s.paon, s.street].filter(Boolean).join(" ") || s.type || "Sale"}
            </span>
            <span className="whitespace-nowrap font-medium">
              {gbp(s.price)} <span className="font-normal text-[var(--muted)]">{s.date?.slice(0, 7)}</span>
            </span>
          </li>
        ))}
      </ul>

      <Source benchmark={benchmark} scope={prices.scope} />
    </Card>
  );
}

function Source({
  benchmark,
  scope = "postcode",
}: {
  benchmark?: MetricBenchmark | null;
  scope?: "postcode" | "sector";
}) {
  return (
    <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
      Source: HM Land Registry Price Paid - recorded sales for{" "}
      {scope === "sector" ? "the surrounding postcode sector" : "this exact postcode"}.
      {benchmark
        ? ` Percentile is local-authority average vs a sample of ${benchmark.sampleSize} English authorities.`
        : ""}
    </p>
  );
}
