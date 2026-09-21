"use client";

/**
 * Factual survey progress (PLAN.md section 44). It renders exactly the stages
 * the store holds, which in turn come only from server events: no timer ticks
 * a step forward, and no completed stage is ever invented.
 */

import { useCityStore, type StageStatus } from "@/store/useCityStore";

const MARKS: Record<StageStatus, string> = {
  pending: "◌", // ◌
  running: "◌",
  done: "✓", // ✓
  failed: "✕", // ✕
};

const TONES: Record<StageStatus, string> = {
  pending: "text-white/35",
  running: "text-white/85",
  done: "text-white/85",
  failed: "text-rose-300",
};

const MARK_TONES: Record<StageStatus, string> = {
  pending: "text-white/30",
  running: "text-accent",
  done: "text-emerald-300",
  failed: "text-rose-300",
};

export default function AnalysisProgress() {
  const stages = useCityStore((s) => s.stages);
  const phase = useCityStore((s) => s.phase);

  if (stages.length === 0 || phase === "idle") return null;

  // A failed survey keeps its panel: the ✕ marks exactly how far it got.
  const surveying = phase === "analyzing" || phase === "building" || phase === "error";

  return (
    <div
      aria-hidden={!surveying}
      aria-live="polite"
      className={`glass pointer-events-none absolute left-1/2 top-[45%] z-10 sm:top-24 w-[min(22rem,calc(100vw-2rem))] -translate-x-1/2 p-4 transition-opacity duration-700 ${
        surveying ? "opacity-100" : "opacity-0"
      }`}
    >
      <p className="eyebrow mb-3">Surveying repository</p>
      <ul className="space-y-1.5 text-[13px]">
        {stages.map((stage) => (
          <li key={stage.id} className={`flex gap-2.5 ${TONES[stage.status]}`}>
            <span aria-hidden className={`w-3 shrink-0 ${MARK_TONES[stage.status]}`}>
              {MARKS[stage.status]}
            </span>
            <span className="min-w-0 break-words">{stage.detail ?? stage.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
