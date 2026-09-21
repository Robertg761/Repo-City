"use client";

/**
 * Factual survey progress (PLAN.md section 44). It renders exactly the stages
 * the store holds and never invents a completed step.
 * W0 ships the skeleton; W6 owns the finished panel.
 */

import { useCityStore } from "@/store/useCityStore";
import type { StageStatus } from "@/store/useCityStore";

const MARKS: Record<StageStatus, string> = {
  pending: "◌",
  running: "◌",
  done: "✓",
  failed: "×",
};

const TONES: Record<StageStatus, string> = {
  pending: "text-white/35",
  running: "text-white/70",
  done: "text-emerald-200",
  failed: "text-rose-300",
};

export default function AnalysisProgress() {
  const stages = useCityStore((s) => s.stages);
  const phase = useCityStore((s) => s.phase);
  const error = useCityStore((s) => s.error);

  if (stages.length === 0 || phase === "ready") return null;

  return (
    <div className="pointer-events-none absolute left-1/2 top-20 w-[min(26rem,80vw)] -translate-x-1/2 rounded-lg border border-white/15 bg-black/45 p-4 text-sm backdrop-blur">
      <p className="mb-2 text-xs font-semibold tracking-[0.3em] text-white/60">
        SURVEYING REPOSITORY
      </p>
      <ul className="space-y-1">
        {stages.map((stage) => (
          <li key={stage.id} className={`flex gap-2 ${TONES[stage.status]}`}>
            <span aria-hidden>{MARKS[stage.status]}</span>
            <span>{stage.detail ?? stage.label}</span>
          </li>
        ))}
      </ul>
      {error ? <p className="mt-3 text-xs text-rose-300">{error.message}</p> : null}
    </div>
  );
}
