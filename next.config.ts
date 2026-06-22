import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The committed datasets in src/data are read from disk at RUNTIME (see src/lib/schools.ts and
  // src/lib/imd.ts), not `import`-bundled. That keeps `next build`'s type-checker from inferring
  // literal types for ~26 MB of JSON, which OOM-hung Vercel's 8 GB build machine. Because the read
  // paths are dynamic, @vercel/nft can't trace these files automatically, so each server route that
  // reads them must list them here to get them copied into its serverless function bundle.
  outputFileTracingIncludes: {
    "/api/area": ["src/data/*.json"], // fetchSchools reads gias + every URN-keyed enrichment file
    "/api/school-search": ["src/data/gias.json", "src/data/nurseries.json"], // searchSchools only
    "/api/deprivation-points": ["src/data/imd-domains-by-lsoa.json"], // imdDomainsForLsoa only
  },
};

export default nextConfig;
