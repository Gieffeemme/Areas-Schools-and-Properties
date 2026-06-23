import { NextRequest, NextResponse } from "next/server";
import { geocodePostcode, geocodePoint, GeocodeResult } from "@/lib/geocode";
import { fetchSchools, ofstedLoaded } from "@/lib/schools";
import { fetchCrime } from "@/lib/crime";
import { fetchPrices } from "@/lib/prices";
import { nearbyAmenities } from "@/lib/amenities";
import { nearestStations } from "@/lib/transport";
import { fetchNoise } from "@/lib/noise";
import { broadbandForLaua } from "@/lib/broadband";
import { cacheGet, cacheSet } from "@/lib/cache";
import { crimeBenchmark, priceBenchmark, benchmarkGeneratedAt } from "@/lib/benchmark";
import { AreaBenchmarks, AreaReport, SourceError } from "@/lib/types";

const CACHE_TTL_SECONDS = 6 * 60 * 60;

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const postcode = searchParams.get("postcode");
  const lat = searchParams.get("lat");
  const lng = searchParams.get("lng");
  const label = searchParams.get("label") ?? undefined;
  // A picked place comes in as coordinates (+ display label); a postcode/place-text comes in as `postcode`.
  const isPlace =
    lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
  const radiusMiles = Math.min(
    5,
    Math.max(0.25, Number(searchParams.get("radius") ?? "1")),
  );

  if (!postcode && !isPlace) {
    return NextResponse.json({ error: "postcode is required" }, { status: 400 });
  }

  const cacheKey = isPlace
    ? `area:@${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}|${radiusMiles}`
    : `area:${postcode!.trim().toLowerCase()}|${radiusMiles}`;
  const cached = await cacheGet<AreaReport>(cacheKey);
  if (cached) return NextResponse.json(cached);

  // Geocoding is the one hard dependency - if it fails, there's nothing to show.
  let geo: GeocodeResult | null = null;
  try {
    geo = isPlace
      ? await geocodePoint(Number(lat), Number(lng), label)
      : await geocodePostcode(postcode!);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Postcode lookup failed";
    return NextResponse.json({ error: message }, { status: 404 });
  }
  const { centre, facts } = geo;

  // The live network layers (schools, crime, prices, noise) run in parallel and fail independently - one
  // outage shouldn't blank the whole dashboard. (Amenities and stations are committed-data reads below.)
  // Defra strategic noise is England-only; skip the lookup elsewhere (geocoding is UK-wide) so we
  // neither show a false "quiet" nor a spurious error for Scotland/Wales/NI.
  const wantNoise = facts.country === "England";
  const [schoolsR, crimeR, pricesR, noiseR] = await Promise.allSettled([
    fetchSchools(centre, radiusMiles),
    fetchCrime(centre),
    fetchPrices(facts.postcode),
    wantNoise ? fetchNoise(centre) : Promise.resolve(null),
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

  const noise = noiseR.status === "fulfilled" ? noiseR.value : null;
  if (wantNoise && noiseR.status === "rejected")
    errors.push({ source: "noise", message: reason(noiseR) });

  // Stations and amenities are committed-dataset lookups (build-stations.mjs / build-amenities.mjs), not
  // network calls - instant and effectively never failing, so they're not `errors` sources. `null` only
  // if a dataset file is missing (a deploy bug); the cache guard below then treats that as not-cacheable.
  const transport = nearestStations(centre);
  const amenities = nearbyAmenities(centre);

  const broadband = broadbandForLaua(facts.lauaCode);

  const benchmarks: AreaBenchmarks = {
    crime: crimeBenchmark(crime?.total),
    price: priceBenchmark(prices?.averagePrice ?? null),
    sampleGeneratedAt: benchmarkGeneratedAt,
  };

  const report: AreaReport = {
    query: postcode ?? facts.label ?? "",
    centre,
    radiusMiles,
    facts,
    schools,
    crime,
    prices,
    amenities,
    transport,
    broadband,
    noise,
    benchmarks,
    ofstedLoaded: ofstedLoaded(),
    errors,
    generatedAt: new Date().toISOString(),
  };

  // Only cache a fully successful report - never freeze a partial/failed result. Transport and amenities
  // are committed data (always present), but keep the null guards as insurance against a missing file.
  if (errors.length === 0 && transport !== null && amenities !== null)
    await cacheSet(cacheKey, report, CACHE_TTL_SECONDS);

  return NextResponse.json(report);
}

function reason(r: PromiseRejectedResult): string {
  return r.reason instanceof Error ? r.reason.message : String(r.reason);
}
