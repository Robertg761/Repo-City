"use client";

/**
 * "Tour": the play button under the settlement name in the identity block.
 * It appears once a city stands and plays the cinematic tour of it.
 */

import { buildTour } from "@/lib/client/tour";
import { useCityStore } from "@/store/useCityStore";

/** Starts the tour of whatever city is on screen. Safe to call from anywhere. */
export function startTour(): void {
  const { city, analysis, actions } = useCityStore.getState();
  actions.tour({ type: "play", stops: buildTour(city, analysis) });
}

export function PlayIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" className={className}>
      <path d="M4.5 2.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L5.4 2.3a.6.6 0 0 0-.9.5Z" fill="currentColor" />
    </svg>
  );
}

export default function TourButton() {
  const ready = useCityStore((s) => s.phase === "ready" && s.city !== null && s.analysis !== null);
  const name = useCityStore((s) => s.city?.settlement?.name ?? s.analysis?.repo.fullName ?? "the city");
  if (!ready) return null;
  return (
    <button
      type="button"
      onClick={startTour}
      aria-label={`Play a guided tour of ${name}`}
      title="A one-minute fly-through of this city's story"
      className="pointer-events-auto mt-2 inline-flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a1206] shadow-[0_6px_18px_-8px_rgba(0,0,0,0.8)] transition hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white animate-fade-in"
    >
      <PlayIcon />
      Tour
    </button>
  );
}
