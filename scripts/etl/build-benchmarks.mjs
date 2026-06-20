#!/usr/bin/env node
/**
 * Build src/data/benchmarks.json — empirical national reference distributions so the app can
 * say "lower crime than X% of areas" and place a local authority's house prices against the
 * rest of England.
 *
 * Method: sample N random English postcodes (postcodes.io /random/postcodes). For each point,
 * record police.uk's ~1-mile crime count. Separately, for every distinct local authority seen,
 * record HM Land Registry's recent average sale price. We store the sorted samples; the app
 * computes a percentile for any value by interpolation (see src/lib/benchmark.ts).
 *
 * Usage:  npm run etl:benchmarks          # default N=150
 *         N=300 npm run etl:benchmarks
 *
 * Re-run periodically to refresh. police.uk rate-limits, so this throttles deliberately.
 */
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "..", "src", "data", "benchmarks.json");
const N = Number(process.env.N || process.argv[2] || 150);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, opts) {
  const res = await fetch(url, opts);
  if (res.status === 429) throw Object.assign(new Error("429"), { rateLimited: true });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function policeCount(lat, lng) {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const data = await getJson(
        `https://data.police.uk/api/crimes-street/all-crime?lat=${lat}&lng=${lng}`,
      );
      return Array.isArray(data) ? data.length : 0;
    } catch (e) {
      if (e.rateLimited) {
        await sleep(1500 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw new Error("police.uk rate-limited");
}

async function laAvgPrice(district) {
  const u =
    `http://landregistry.data.gov.uk/data/ppi/transaction-record.json` +
    `?propertyAddress.district=${encodeURIComponent(district)}&_pageSize=100&_sort=-transactionDate`;
  const d = await getJson(u, { headers: { Accept: "application/json" } });
  const items = d?.result?.items ?? [];
  const prices = items.map((it) => Number(it.pricePaid) || 0).filter((p) => p > 0);
  if (!prices.length) return null;
  return Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
}

async function main() {
  console.log(`Sampling ${N} random English postcodes for crime …`);
  const crime = [];
  const laSet = new Set();
  let got = 0;
  let skipped = 0;

  for (let i = 0; i < N; i++) {
    try {
      const r = await getJson("https://api.postcodes.io/random/postcodes");
      const x = r.result;
      if (!x || x.country !== "England") {
        skipped++;
        continue;
      }
      const c = await policeCount(x.latitude, x.longitude);
      crime.push(c);
      if (x.admin_district) laSet.add(x.admin_district.toUpperCase());
      got++;
      if (got % 20 === 0) console.log(`  ${got}/${N} (last crime=${c}, distinct LAs=${laSet.size})`);
      await sleep(250); // be polite to police.uk
    } catch {
      skipped++;
      await sleep(400);
    }
  }

  console.log(`Pricing ${laSet.size} local authorities via Land Registry …`);
  const price = [];
  for (const la of laSet) {
    try {
      const avg = await laAvgPrice(la);
      if (avg) price.push(avg);
      await sleep(120);
    } catch {
      /* skip this LA */
    }
  }

  crime.sort((a, b) => a - b);
  price.sort((a, b) => a - b);

  const out = {
    generatedAt: new Date().toISOString(),
    crime: { n: crime.length, samples: crime },
    price: { n: price.length, samples: price },
  };
  await writeFile(OUT, JSON.stringify(out) + "\n");

  const med = (a) => (a.length ? a[a.length >> 1] : 0);
  console.log(
    `\nDone (skipped ${skipped}). crime n=${crime.length} [min ${crime[0]}, median ${med(crime)}, max ${crime[crime.length - 1]}]; ` +
      `price n=${price.length} [median £${med(price)}]. Wrote ${OUT}`,
  );
}

main().catch((e) => {
  console.error("benchmarks ETL failed:", e.message);
  process.exit(1);
});
