"use client";

/**
 * The tour's chrome: letterbox bars, the caption, a progress bar and three
 * small controls. Everything else on the HUD fades away while the tour plays
 * and comes back when it ends, so the city has the screen to itself.
 *
 * Keyboard: Space pauses and resumes, the right arrow skips to the next stop,
 * Escape ends the tour. A press, drag or wheel turn on the city also ends it,
 * handled where the camera is (`useTourDirector`).
 *
 * `?tour=1` in the address starts the tour on its own once the first city has
 * finished building: the demo video and shared links begin with it.
 */

import { useEffect, useRef, type ReactNode } from "react";
import { cityRevealEnd, REVEAL_MS } from "@/components/city/reveal";
import { isTouring, type TourState } from "@/lib/client/tourState";
import { useCityStore } from "@/store/useCityStore";
import { tourClock } from "./clock";
import { PlayIcon, startTour } from "./TourButton";

/** After the reveal ends, a beat for the arrival glide to settle before the tour sets off. */
const AUTO_START_SETTLE_MS = 1800;

/** Whether the address asks for the tour: `?tour`, `?tour=1`, `?tour=true`. */
export function tourRequested(search: string): boolean {
  const params = new URLSearchParams(search);
  if (!params.has("tour")) return false;
  const value = (params.get("tour") ?? "").trim().toLowerCase();
  return !["0", "false", "off", "no"].includes(value);
}

/**
 * While the tour plays every other overlay steps aside: the direct children
 * of `<main>` except the canvas (the first) and the tour's own layer.
 */
const CHROME_CSS = `
main > :not(:first-child):not([data-tour-ui]) { transition: opacity 450ms ease; }
html[data-touring] main > :not(:first-child):not([data-tour-ui]) {
  opacity: 0; visibility: hidden; pointer-events: none;
  transition: opacity 450ms ease, visibility 0s linear 450ms;
}
@keyframes repo-city-tour-caption {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: none; }
}
@keyframes repo-city-tour-bar { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes repo-city-tour-dip { from { opacity: 0.85; } to { opacity: 0; } }
.tour-caption { animation: repo-city-tour-caption 700ms cubic-bezier(0.2, 0.8, 0.2, 1) 180ms both; }
.tour-bar { animation: repo-city-tour-bar 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.tour-dip { animation: none; opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .tour-caption { animation: repo-city-fade-in 240ms ease-out both; transform: none; }
  .tour-bar { animation: none; }
  .tour-dip { animation: repo-city-tour-dip 420ms ease-out both; }
}
`;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="currentColor">
      {children}
    </svg>
  );
}

const PauseIcon = () => (
  <Icon>
    <rect x="3.5" y="2.5" width="3" height="11" rx="0.8" />
    <rect x="9.5" y="2.5" width="3" height="11" rx="0.8" />
  </Icon>
);

const NextIcon = () => (
  <Icon>
    <path d="M2.8 3.2v9.6a.6.6 0 0 0 .9.5l7-4.8a.6.6 0 0 0 0-1l-7-4.8a.6.6 0 0 0-.9.5Z" />
    <rect x="11.2" y="2.8" width="2.2" height="10.4" rx="0.7" />
  </Icon>
);

const CloseIcon = () => (
  <Icon>
    <path d="M4.2 3.1 8 6.9l3.8-3.8 1.1 1.1L9.1 8l3.8 3.8-1.1 1.1L8 9.1l-3.8 3.8-1.1-1.1L6.9 8 3.1 4.2Z" />
  </Icon>
);

const CONTROL =
  "pointer-events-auto grid h-8 w-8 place-items-center rounded-full bg-white/10 text-white/85 transition hover:bg-white/20 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** One segment per stop; the current one fills as the stop plays. */
function Progress({ tour }: { tour: TourState }) {
  const fill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const el = fill.current;
      if (el) {
        const mine = tourClock.run === tour.run && tourClock.index === tour.index;
        el.style.transform = `scaleX(${mine ? tourClock.fraction : 0})`;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [tour.run, tour.index]);

  return (
    <div
      className="flex min-w-0 flex-1 items-center gap-1"
      role="progressbar"
      aria-label="Tour progress"
      aria-valuemin={1}
      aria-valuemax={tour.stops.length}
      aria-valuenow={tour.index + 1}
      aria-valuetext={`Stop ${tour.index + 1} of ${tour.stops.length}`}
    >
      {tour.stops.map((stop, i) => (
        <span key={stop.key} className="relative h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-white/20">
          <span
            ref={i === tour.index ? fill : undefined}
            className="absolute inset-0 origin-left rounded-full bg-white/85"
            style={{ transform: `scaleX(${i < tour.index ? 1 : 0})` }}
          />
        </span>
      ))}
    </div>
  );
}

/** Starts the tour once the first city is built, when the address asks for it. */
function useAutoStart(): void {
  const phase = useCityStore((s) => s.phase);
  const city = useCityStore((s) => s.city);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || phase !== "ready" || !city) return;
    if (!tourRequested(window.location.search)) {
      done.current = true;
      return;
    }
    const timer = window.setTimeout(
      () => {
        done.current = true;
        if (useCityStore.getState().city === city) startTour();
      },
      cityRevealEnd(city) + REVEAL_MS + AUTO_START_SETTLE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [phase, city]);
}

/** Space, the right arrow and Escape, for as long as the tour plays. */
function useTourKeys(touring: boolean): void {
  useEffect(() => {
    if (!touring) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const { actions } = useCityStore.getState();
      if (event.key === "Escape") {
        event.preventDefault();
        actions.tour({ type: "exit", to: "overview" });
      } else if (event.key === " " || event.key === "k") {
        // A focused button already answers Space with a click.
        if (event.key === " " && target?.closest("button")) return;
        event.preventDefault();
        actions.tour({ type: "toggle" });
      } else if (event.key === "ArrowRight" || event.key === "n") {
        event.preventDefault();
        actions.tour({ type: "next" });
      }
    };
    // Capture, so Escape ends the tour before the inspector's own handler
    // reads it as "close the inspector".
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [touring]);
}

/** Marks the document while the tour plays, which hides the rest of the HUD. */
function useChromeHidden(touring: boolean): void {
  useEffect(() => {
    const root = document.documentElement;
    if (touring) root.setAttribute("data-touring", "");
    else root.removeAttribute("data-touring");
    return () => root.removeAttribute("data-touring");
  }, [touring]);
}

/**
 * Focus moves to the pause button when the tour starts, so the keyboard is
 * already on the controls, and back to wherever it was when the tour ends.
 */
function useTourFocus(touring: boolean, pause: React.RefObject<HTMLButtonElement | null>): void {
  const before = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!touring) return;
    before.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pause.current?.focus({ preventScroll: true });
    return () => {
      const back = before.current;
      if (back && back.isConnected) back.focus({ preventScroll: true });
    };
  }, [touring, pause]);
}

export default function TourOverlay() {
  const tour = useCityStore((s) => s.tour);
  const actions = useCityStore((s) => s.actions);
  const touring = isTouring(tour);
  const pause = useRef<HTMLButtonElement>(null);

  useAutoStart();
  useTourKeys(touring);
  useChromeHidden(touring);
  useTourFocus(touring, pause);

  const stop = touring ? tour.stops[tour.index] : null;
  const paused = tour.status === "paused";

  return (
    <div data-tour-ui className="pointer-events-none absolute inset-0 z-40">
      <style>{CHROME_CSS}</style>
      {stop ? (
        <>
          {/* Letterbox: thin enough to leave a phone its city. */}
          <div className="tour-bar absolute inset-x-0 top-0 h-[min(6vh,64px)] origin-top bg-black/85" />
          <div className="tour-bar absolute inset-x-0 bottom-0 h-[min(6vh,64px)] origin-bottom bg-black/85" />
          <div key={`dip-${tour.run}-${tour.index}`} className="tour-dip absolute inset-0 bg-black" />

          {/* A scrim under the caption keeps it readable over a bright sky. */}
          <div className="absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

          <section
            aria-label="City tour"
            className="absolute inset-x-0 bottom-[min(6vh,64px)] flex justify-center px-4 pb-4 sm:pb-6"
          >
            <div className="w-full max-w-[40rem]">
              <div key={`${tour.run}-${tour.index}`} className="tour-caption" aria-live="polite" aria-atomic="true">
                <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-accent drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)] sm:text-[11px]">
                  {stop.caption.eyebrow}
                </p>
                <h2 className="mt-1.5 text-[1.45rem] font-light leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] sm:text-[2rem]">
                  {stop.caption.title}
                </h2>
                <p className="mt-1.5 text-[13px] leading-snug text-white/85 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] sm:text-[15px]">
                  {stop.caption.line}
                </p>
              </div>

              <div className="mt-3 flex items-center gap-2 sm:mt-4">
                <Progress tour={tour} />
                <span className="w-9 shrink-0 text-center text-[10px] tabular-nums text-white/60" aria-hidden="true">
                  {tour.index + 1}/{tour.stops.length}
                </span>
                <button
                  ref={pause}
                  type="button"
                  onClick={() => actions.tour({ type: "toggle" })}
                  aria-label={paused ? "Resume the tour" : "Pause the tour"}
                  aria-keyshortcuts="Space"
                  className={CONTROL}
                >
                  {paused ? <PlayIcon className="h-3.5 w-3.5" /> : <PauseIcon />}
                </button>
                <button
                  type="button"
                  onClick={() => actions.tour({ type: "next" })}
                  aria-label={tour.index === tour.stops.length - 1 ? "Finish the tour" : "Next stop"}
                  aria-keyshortcuts="ArrowRight"
                  className={CONTROL}
                >
                  <NextIcon />
                </button>
                <button
                  type="button"
                  onClick={() => actions.tour({ type: "exit", to: "overview" })}
                  aria-label="End the tour"
                  aria-keyshortcuts="Escape"
                  className={CONTROL}
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
