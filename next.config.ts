import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // `next build`'s "Running TypeScript" step OOM-hangs on Vercel's 8 GB build machine: TypeScript
    // infers literal types for the multi-MB committed JSON in src/data/*.json (the 3.1 MB IMD file
    // tipped it over). We run `tsc --noEmit` ourselves on every change, so skip the redundant
    // in-build check. This is exactly what Next's memory-usage guide recommends for this symptom.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
