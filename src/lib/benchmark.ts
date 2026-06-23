import benchmarksData from "@/data/benchmarks.json";
import { MetricBenchmark } from "./types";

interface Distribution {
  n: number;
  samples: number[];
}
interface BenchmarksFile {
  generatedAt: string | null;
  crime: Distribution;
  price: Distribution;
}

const benchmarks = benchmarksData as unknown as BenchmarksFile;

/** True once etl:benchmarks has populated src/data/benchmarks.json. */
export const benchmarksLoaded: boolean =
  !!benchmarks.generatedAt && benchmarks.crime.n > 0;

export const benchmarkGeneratedAt: string | null = benchmarks.generatedAt;

/** Percentile (0-100) of `value` within an ascending-sorted sample (share strictly below). */
function percentileOf(value: number, samples: number[]): number {
  const n = samples.length;
  if (n === 0) return 0;
  let below = 0;
  for (const s of samples) {
    if (s < value) below++;
    else break; // samples are sorted ascending
  }
  return Math.round((below / n) * 100);
}

export function crimeBenchmark(total: number | null | undefined): MetricBenchmark | null {
  if (benchmarks.crime.n === 0 || total == null) return null;
  return {
    percentile: percentileOf(total, benchmarks.crime.samples),
    sampleSize: benchmarks.crime.n,
  };
}

export function priceBenchmark(avg: number | null | undefined): MetricBenchmark | null {
  if (benchmarks.price.n === 0 || avg == null) return null;
  return {
    percentile: percentileOf(avg, benchmarks.price.samples),
    sampleSize: benchmarks.price.n,
  };
}
