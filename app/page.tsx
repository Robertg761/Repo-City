"use client";

/**
 * The only route in the application (PLAN.md section 0.2). One persistent 3D
 * city viewport fills the screen; every control overlays it. Nothing here ever
 * navigates, and no overlay replaces the world.
 *
 * This file is a Client Component because `next/dynamic` with `ssr: false` is
 * not allowed in a Server Component, and three.js must not run on the server.
 */

import dynamic from "next/dynamic";
import AnalysisProgress from "@/components/AnalysisProgress";
import CityHUD from "@/components/CityHUD";
import ErrorBanner from "@/components/ErrorBanner";
import Inspector from "@/components/Inspector";
import Legend from "@/components/Legend";
import RepoInput from "@/components/RepoInput";
import Tooltip from "@/components/Tooltip";

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

      {/* Overlays. The canvas keeps the pointer: each overlay wrapper is
          `pointer-events-none` and only its own card opts back in, so orbiting
          and clicking work everywhere the HUD is not actually drawn. */}
      <CityHUD />
      <RepoInput />
      <AnalysisProgress />
      <Inspector />
      <Tooltip />
      <Legend />
      <ErrorBanner />
    </main>
  );
}
