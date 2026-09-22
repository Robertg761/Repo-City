import { execSync } from "node:child_process";
import type { NextConfig } from "next";
import pkg from "./package.json" with { type: "json" };

/**
 * Build identity shown in the HUD's top-left corner so a viewer can tell which
 * deployment they are looking at. The short SHA comes from Vercel's git
 * metadata when present, else from the local checkout, else it is omitted.
 */
function shortSha(): string {
  const fromVercel = process.env.VERCEL_GIT_COMMIT_SHA;
  if (fromVercel) return fromVercel.slice(0, 7);
  try {
    return execSync("git rev-parse --short=7 HEAD", { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_SHA: shortSha(),
  },
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
