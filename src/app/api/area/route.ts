import { NextRequest, NextResponse } from "next/server";
import { geocodePostcode, geocodePoint, GeocodeResult } from "@/lib/geocode";
import { fetchSchools, ofstedLoaded } from "@/lib/schools";
import { fetchCrime } from "@/lib/crime";
import { fetchPrices } from "@/lib/prices";
import { nearbyAmenities } from "@/lib/amenities";
import { nearbyEvCharging } from "@/lib/evCharging";
import { nearestStations } from "@/lib/transport";
import { fetchNoise } from "@/lib/noise";
import { fetchCensus } from "@/lib/census";
import { broadbandForLaua } from "@/lib/broadband";
import { mobileForLaua } from "@/lib/mobile";
import { airQualityForPoint } from "@/lib/airQuality";
import { nearestBathingWater } from "@/lib/bathingWater";
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
  // Census 2021 covers England & Wales; skip elsewhere (geocoding is UK-wide).
  const wantCensus = facts.country === "England" || facts.country === "Wales";
  const [schoolsR, crimeR, pricesR, noiseR, censusR] = await Promise.allSettled([
    fetchSchools(centre, radiusMiles),
    fetchCrime(centre),
    fetchPrices(facts.postcode),
    wantNoise ? fetchNoise(centre) : Promise.resolve(null),
    wantCensus ? fetchCensus(facts.lsoa21Code) : Promise.resolve(null),
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

  // Census is supplementary - a Nomis hiccup hides the panel, it doesn't fail (or block caching of) the report.
  const census = censusR.status === "fulfilled" ? censusR.value : null;

  // Stations and amenities are committed-dataset lookups (build-stations.mjs / build-amenities.mjs), not
  // network calls - instant and effectively never failing, so they're not `errors` sources. `null` only
  // if a dataset file is missing (a deploy bug); the cache guard below then treats that as not-cacheable.
  const transport = nearestStations(centre);
  const amenities = nearbyAmenities(centre);
  const evCharging = nearbyEvCharging(centre);

  const broadband = broadbandForLaua(facts.lauaCode);
  const mobile = mobileForLaua(facts.lauaCode);
  // Modelled background NO2/PM2.5 at the point — a committed-dataset lookup (Defra PCM 1 km grid), keyed
  // by the postcode's OSGB easting/northing. GB only: the PCM grid is OSGB, and postcodes.io returns the
  // IRISH GRID easting/northing for NI — which would otherwise alias onto an unrelated GB cell — so gate
  // on the three GB countries, not just on having coordinates.
  const inGB =
    facts.country === "England" || facts.country === "Scotland" || facts.country === "Wales";
  const airQuality = inGB ? airQualityForPoint(facts.easting, facts.northing) : null;
  // Nearest designated bathing water (committed EA dataset) - null unless within the coastal threshold.
  const bathingWater = nearestBathingWater(centre);

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
    evCharging,
    transport,
    broadband,
    mobile,
    noise,
    airQuality,
    bathingWater,
    census,
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
