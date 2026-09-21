import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Curated interpretations are read with fs at runtime; make sure the
  // serverless bundle for the analysis route carries them (PLAN.md section 28).
  //
  // The key is a *route* glob, not an entry name: Next traces the App Router
  // entry `app/api/analyze/route`, normalises it to `/app/api/analyze` and
  // matches these keys with picomatch in `contains` mode (see
  // `next/dist/build/collect-build-traces.js`). So `/api/analyze` matches and
  // `/api/analyze/route` would not. Values are globs from the project root.
  outputFileTracingIncludes: {
    "/api/analyze": ["./fixtures/interpretations/**", "./fixtures/*.analysis.json"],
  },
};

export default nextConfig;
