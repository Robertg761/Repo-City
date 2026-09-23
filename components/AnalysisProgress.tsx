"use client";

/**
 * Factual survey progress (PLAN.md section 44). It renders exactly the stages
 * the store holds, which in turn come only from server events: no timer ticks
 * a step forward, and no completed stage is ever invented.
 */

import { splitStageDetail, stageLine } from "@/lib/client/progress";
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
  // A skipped architecture pass is a failed row in a finished survey; only a
  // survey that never reached its last row stopped.
  const complete = stages.some((stage) => stage.id === "done" && stage.status === "done");
  const stopped = !complete && (phase === "error" || stages.some((stage) => stage.status === "failed"));

  return (
    <div
      aria-hidden={!surveying}
      aria-live="polite"
      // Finished, the panel holds its last tick ("Town constructed") for a
      // moment while the city starts to rise, then fades: it used to fade
      // out in the same instant the city mounted, so nobody saw it finish.
      className={`glass pointer-events-none absolute left-1/2 top-[45%] z-[21] sm:top-24 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 p-4 transition-opacity ${
        surveying ? "opacity-100 duration-200" : complete ? "opacity-0 delay-1000 duration-700" : "opacity-0 duration-300"
      }`}
    >
      <p className={`eyebrow mb-3 ${stopped ? "text-rose-200/80" : ""}`}>
        {stopped ? "Survey stopped" : complete ? "Survey complete" : "Surveying repository"}
      </p>
      <ul className="space-y-1.5 text-[13px]">
        {stages.map((stage) => {
          // A stage reports `running` again and again as pages land ("300
          // open issues surveyed", then "600"); keyed by id, the row updates
          // in place, and tabular figures keep the count from jittering.
          const { text, note } = splitStageDetail(stageLine(stage));
          return (
            <li key={stage.id} className={`flex gap-2.5 ${TONES[stage.status]}`}>
              <span
                aria-hidden
                className={`w-3 shrink-0 ${MARK_TONES[stage.status]} ${
                  stage.status === "running" ? "motion-safe:animate-pulse" : ""
                }`}
              >
                {MARKS[stage.status]}
              </span>
              <span className="min-w-0 break-words tabular-nums">
                {text}
                {note ? <span className="text-white/45"> ({note})</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
