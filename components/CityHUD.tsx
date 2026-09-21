"use client";

/**
 * Top-left identity block and top-right health readout (PLAN.md section 40).
 * W0 ships the skeleton; W6 owns the finished HUD.
 */

import { useCityStore } from "@/store/useCityStore";

export default function CityHUD() {
  const analysis = useCityStore((s) => s.analysis);
  const phase = useCityStore((s) => s.phase);
  const health = analysis?.metrics.health ?? null;
  const confidence = analysis?.metrics.confidence ?? null;

  return (
    <>
      <div className="pointer-events-none absolute left-5 top-5 select-none">
        <p className="text-xs font-semibold tracking-[0.35em] text-white/90 drop-shadow">
          REPO CITY
        </p>
        <p className="mt-1 text-sm text-white/70 drop-shadow">
          {analysis?.repo.fullName ?? "no repository surveyed"}
        </p>
        {analysis?.repo.archived ? (
          <p className="mt-1 text-xs uppercase tracking-widest text-amber-200/90">
            Archived repository
          </p>
        ) : null}
      </div>

      <div className="pointer-events-none absolute right-5 top-5 select-none text-right">
        <p className="text-xs font-semibold tracking-[0.3em] text-white/70 drop-shadow">
          CITY HEALTH
        </p>
        <p className="text-4xl font-light tabular-nums text-white drop-shadow">
          {health ? health.score : phase === "analyzing" ? "··" : "--"}
        </p>
        {health ? (
          <p className="text-xs uppercase tracking-widest text-white/70">{health.band}</p>
        ) : null}
        {confidence ? (
          <p className="text-[11px] text-white/50">Confidence: {confidence.level}</p>
        ) : null}
      </div>
    </>
  );
}
