"use client";

/**
 * Right-side context inspector (PLAN.md sections 40 and 41). One component
 * handles every selectable object; it overlays the city and never replaces it.
 * W0 ships an empty shell; W6 fills in the per-kind bodies including the
 * "WHY THIS EXISTS" explanation.
 */

import { useCityStore } from "@/store/useCityStore";

export default function Inspector() {
  const selectedId = useCityStore((s) => s.selectedId);
  const returnToOverview = useCityStore((s) => s.actions.returnToOverview);

  if (!selectedId) return null;

  return (
    <aside className="absolute right-5 top-28 bottom-16 w-[min(22rem,80vw)] overflow-y-auto rounded-lg border border-white/15 bg-black/55 p-4 text-sm text-white/80 backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-[0.3em] text-white/60">INSPECTOR</p>
        <button
          type="button"
          onClick={returnToOverview}
          className="rounded px-2 py-0.5 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
        >
          Close
        </button>
      </div>
      <p className="mt-3 break-all font-mono text-xs text-white/50">{selectedId}</p>
      <p className="mt-4 text-white/40">Details land with workstream W6.</p>
    </aside>
  );
}
