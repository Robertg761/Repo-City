import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Curated interpretations are read with fs at runtime; make sure the
  // serverless bundle for the analysis route carries them (PLAN.md section 28).
  outputFileTracingIncludes: {
    "/api/analyze": ["./fixtures/interpretations/**", "./fixtures/*.analysis.json"],
  },
};

export default nextConfig;
