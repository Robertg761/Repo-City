"use client";

/**
 * Bottom-left legend (PLAN.md section 40). It teaches the visual language -
 * the thing that makes the whole city readable - plus the camera controls.
 *
 * Collapsed by default on small screens, where the city needs the room.
 */

import { useCallback, useState, useSyncExternalStore } from "react";

const SMALL_SCREEN = "(max-width: 640px)";

const LANGUAGE: readonly (readonly [string, string])[] = [
  ["Building", "a file or module, height follows importance"],
  ["District", "a top-level area of the codebase"],
  ["Incident", "an open issue"],
  ["Crane", "a pull request"],
  ["Power plant", "continuous integration"],
  ["Fire station", "test infrastructure"],
  ["Information centre", "documentation"],
  ["Station", "releases"],
];

const CONTROLS: readonly (readonly [string, string])[] = [
  ["Drag", "orbit"],
  ["Right-drag", "pan"],
  ["Wheel", "zoom"],
  ["Click", "select"],
];

/**
 * Subscribed rather than read once, so the server render and the first client
 * render agree (it reports `false` on the server) and a rotation is picked up.
 */
function useSmallScreen(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    const query = window.matchMedia(SMALL_SCREEN);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(SMALL_SCREEN).matches,
    () => false,
  );
}

export default function Legend() {
  const smallScreen = useSmallScreen();
  const [override, setOverride] = useState<boolean | null>(null);
  const open = override ?? !smallScreen;
  const setOpen = (next: (value: boolean) => boolean) => setOverride(next(open));

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[min(18rem,calc(100vw-1.5rem))]">
      <div className="glass pointer-events-auto p-3 text-[12px] text-white/70">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center justify-between gap-6 text-left focus:outline-none"
        >
          <span className="eyebrow">Legend</span>
          <span aria-hidden className="text-white/45">
            {open ? "−" : "+"}
          </span>
        </button>

        {open ? (
          <div className="mt-2.5">
            <ul className="space-y-1">
              {LANGUAGE.map(([term, meaning]) => (
                <li key={term} className="flex gap-2">
                  <span className="w-[6.5rem] shrink-0 text-white/85">{term}</span>
                  <span className="min-w-0 text-white/50">{meaning}</span>
                </li>
              ))}
            </ul>
            <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/10 pt-2.5 text-[11px] text-white/50">
              {CONTROLS.map(([input, action]) => (
                <li key={input}>
                  <span className="text-white/80">{input}</span> {action}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}
