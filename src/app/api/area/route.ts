import { NextRequest, NextResponse } from "next/server";
import { geocodePostcode, GeocodeResult } from "@/lib/geocode";
import { fetchSchools, ofstedLoaded } from "@/lib/schools";
import { fetchCrime } from "@/lib/crime";
import { fetchPrices } from "@/lib/prices";
import { fetchAmenities } from "@/lib/amenities";
import { cacheGet, cacheSet } from "@/lib/cache";
import { crimeBenchmark, priceBenchmark, benchmarkGeneratedAt } from "@/lib/benchmark";
import { AreaBenchmarks, AreaReport, SourceError } from "@/lib/types";

const CACHE_TTL_SECONDS = 6 * 60 * 60;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const postcode = searchParams.get("postcode");
  const radiusMiles = Math.min(
    5,
    Math.max(0.25, Number(searchParams.get("radius") ?? "1")),
  );

  if (!postcode) {
    return NextResponse.json({ error: "postcode is required" }, { status: 400 });
  }

  const cacheKey = `area:${postcode.trim().toLowerCase()}|${radiusMiles}`;
  const cached = await cacheGet<AreaReport>(cacheKey);
  if (cached) return NextResponse.json(cached);

  // Geocoding is the one hard dependency — if it fails, there's nothing to show.
  let geo: GeocodeResult | null = null;
  try {
    geo = await geocodePostcode(postcode);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Postcode lookup failed";
    return NextResponse.json({ error: message }, { status: 404 });
  }
  const { centre, facts } = geo;

  // The three data layers run in parallel and fail independently — one outage shouldn't
  // blank the whole dashboard.
  const [schoolsR, crimeR, pricesR, amenitiesR] = await Promise.allSettled([
    fetchSchools(centre, radiusMiles),
    fetchCrime(centre),
    fetchPrices(facts.postcode),
    fetchAmenities(centre),
  ]);

  const errors: SourceError[] = [];

  const schools = schoolsR.status === "fulfilled" ? schoolsR.value : [];
  if (schoolsR.status === "rejected")
    errors.push({ source: "schools", message: reason(schoolsR) });

  const crime = crimeR.status === "fulfilled" ? crimeR.value : null;
  if (crimeR.status === "rejected")
    errors.push({ source: "crime", message: reason(crimeR) });

  const prices = pricesR.status === "fulfilled" ? pricesR.value : null;
  if (pricesR.status === "rejected")
    errors.push({ source: "prices", message: reason(pricesR) });

  const amenities = amenitiesR.status === "fulfilled" ? amenitiesR.value : null;
  if (amenitiesR.status === "rejected")
    errors.push({ source: "amenities", message: reason(amenitiesR) });

  const benchmarks: AreaBenchmarks = {
    crime: crimeBenchmark(crime?.total),
    price: priceBenchmark(prices?.averagePrice ?? null),
    sampleGeneratedAt: benchmarkGeneratedAt,
  };

  const report: AreaReport = {
    query: postcode,
    centre,
    radiusMiles,
    facts,
    schools,
    crime,
    prices,
    amenities,
    benchmarks,
    ofstedLoaded: ofstedLoaded(),
    errors,
    generatedAt: new Date().toISOString(),
  };

  // Only cache a fully successful report — never freeze a partial/failed result.
  if (errors.length === 0) await cacheSet(cacheKey, report, CACHE_TTL_SECONDS);

  return NextResponse.json(report);
}

function reason(r: PromiseRejectedResult): string {
  return r.reason instanceof Error ? r.reason.message : String(r.reason);
}
