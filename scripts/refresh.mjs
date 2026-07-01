// Re-runs a cadence group of ETLs, regenerates the freshness manifest, and prints a Markdown summary
// to stdout (the GitHub Action tees this into the pull-request body). Used by
// .github/workflows/refresh-data.yml, or locally: `node scripts/refresh.mjs <group>`.
//
// It never commits anything itself — a human reviews the resulting data diff in the PR. Partial
// failure is fine: ETLs that succeed still produce a reviewable diff; failures are reported.

import { spawnSync } from "node:child_process";

// Cadence groups — every etl:* command lives in exactly one group; `all` is the union.
const GROUPS = {
  monthly: ["gias", "schools", "nurseries", "report-cards"], // registers + Ofsted grades (~monthly)
  "school-results": ["ks2", "ks4", "ks5", "benchmarks", "destinations", "parentview", "finance", "workforce"], // annual, autumn
  "area-annual": ["broadband", "mobile", "air-quality", "bathing-water", "income", "affordability", "council-tax", "council-tax-cost", "scotland-council-tax", "scotland-crime", "cqc"], // annual area stats
  nations: ["welsh-schools", "scotland-schools", "ni-schools"], // devolved school registers (~annual)
  deprivation: ["imd", "wimd", "simd", "nimdm"], // multi-year deprivation indices
  geo: ["amenities", "stations", "ev-charging", "greenspace", "census"], // OSM / rare / near-static
};
GROUPS.all = [...new Set(Object.values(GROUPS).flat())];

const group = (process.argv[2] || "monthly").trim();
const names = GROUPS[group];
if (!names) {
  console.error(`Unknown group "${group}". Options: ${Object.keys(GROUPS).join(", ")}`);
  process.exit(2);
}

const stamp = new Date().toISOString();
console.log(`## Data refresh — \`${group}\` group\n`);
console.log(`Re-ran ${names.length} ETL(s) at ${stamp}. Review the data diff below before merging.\n`);

const results = [];
for (const name of names) {
  const t = Date.now();
  const r = spawnSync("npm", ["run", `etl:${name}`], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  const secs = Math.round((Date.now() - t) / 1000);
  const ok = r.status === 0;
  results.push({ name, ok, secs });
  if (!ok) {
    const tail = ((r.stderr || "") + (r.stdout || "")).trim().split("\n").slice(-15).join("\n");
    console.log(`<details><summary>❌ <code>etl:${name}</code> failed (${secs}s)</summary>\n\n\`\`\`\n${tail}\n\`\`\`\n</details>\n`);
  }
}

// Regenerate the freshness manifest so /api/health reflects the new vintages.
const man = spawnSync("node", ["scripts/build-data-manifest.mjs"], { encoding: "utf8" });
console.log(`_${(man.stdout || man.stderr || "manifest step ran").trim()}_\n`);

console.log(`| ETL | Result | Time |`);
console.log(`|-----|--------|------|`);
for (const r of results) console.log(`| \`etl:${r.name}\` | ${r.ok ? "✅ ok" : "❌ failed"} | ${r.secs}s |`);

const failed = results.filter((r) => !r.ok);
console.log(
  `\n**${results.length - failed.length}/${results.length} succeeded.**` +
    (failed.length ? ` Failed: ${failed.map((f) => f.name).join(", ")} — some open-data hosts block CI IPs or rate-limit; re-run those locally if needed.` : ""),
);

// Exit non-zero only if EVERYTHING failed (nothing to review); partial success still opens a PR.
process.exit(failed.length === results.length ? 1 : 0);
