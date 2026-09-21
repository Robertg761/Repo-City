"use client";

/**
 * The only route in the application (PLAN.md section 0.2). One persistent 3D
 * city viewport fills the viewport; every control overlays it.
 *
 * This file is a Client Component because `next/dynamic` with `ssr: false` is
 * not allowed in a Server Component, and three.js must not run on the server.
 */

import dynamic from "next/dynamic";
import AnalysisProgress from "@/components/AnalysisProgress";
import CityHUD from "@/components/CityHUD";
import Inspector from "@/components/Inspector";
import Legend from "@/components/Legend";
import RepoInput from "@/components/RepoInput";

const CityCanvas = dynamic(() => import("@/components/CityCanvas"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-[#b9d4e6]" />,
});

export default function Page() {
  return (
    // `fixed inset-0` rather than a viewport-unit height: the city must fill
    // the screen exactly on every browser, and the page never scrolls.
    <main className="fixed inset-0 overflow-hidden bg-[#b9d4e6]">
      <div className="absolute inset-0">
        <CityCanvas />
      </div>

      {/* Overlays. The canvas keeps pointer events; panels opt back in. */}
      <CityHUD />
      <RepoInput />
      <AnalysisProgress />
      <Inspector />
      <Legend />
    </main>
  );
}
