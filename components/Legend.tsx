"use client";

/**
 * Bottom-left legend (PLAN.md sections 40 and 76.10). It teaches the visual
 * language - the thing that makes the whole city readable - plus the camera
 * controls.
 *
 * Three short tabs rather than one long list: the city's buildings and
 * landmarks, the seven shapes an open issue takes, and the shapes and signals
 * of a pull request. Collapsed by default on small screens, where the city
 * needs the room: a narrow phone, or one held sideways, where the open
 * legend is taller than the screen leaves under the identity block.
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import { LEGEND_CONTROLS, LEGEND_SECTIONS, type LegendEntry } from "@/lib/client/legend";
import { useCityStore } from "@/store/useCityStore";

const SMALL_SCREEN = "(max-width: 640px), (max-height: 600px)";

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

function Entries({ entries }: { entries: readonly LegendEntry[] }) {
  return (
    <ul className="space-y-1">
      {entries.map(([term, meaning]) => (
        <li key={term} className="flex gap-2">
          <span className="w-[6.5rem] shrink-0 text-white/85">{term}</span>
          <span className="min-w-0 text-white/50">{meaning}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Legend() {
  const smallScreen = useSmallScreen();
  const [override, setOverride] = useState<boolean | null>(null);
  const [tab, setTab] = useState<(typeof LEGEND_SECTIONS)[number]["id"]>("city");
  const open = override ?? !smallScreen;
  const setOpen = (next: (value: boolean) => boolean) => setOverride(next(open));

  // On a phone the inspector is a bottom sheet over the same corner, so
  // selecting something folds the legend away. Adjusted during render, the
  // pattern React documents for "state derived from a change".
  const inspecting = useCityStore((s) => s.selectedId !== null);
  const [sawInspecting, setSawInspecting] = useState(inspecting);
  if (sawInspecting !== inspecting) {
    setSawInspecting(inspecting);
    if (inspecting && smallScreen) setOverride(false);
  }
  const section = LEGEND_SECTIONS.find((entry) => entry.id === tab) ?? LEGEND_SECTIONS[0];

  return (
    /* Open on a phone, the legend is taller than the gap under the health
       card, so it lifts above the right-hand rail rather than slide under
       the card. Folded, it stays below the rail's inspector sheet. */
    <div
      className={`pointer-events-none absolute bottom-3 left-3 max-w-[min(18.5rem,calc(100vw-1.5rem))] ${
        open && smallScreen ? "z-[24]" : "z-20"
      }`}
    >
      {/* Never taller than the room under the identity block; the tabs
          scroll inside it instead. */}
      <div className="glass pointer-events-auto max-h-[calc(100dvh-11rem)] overflow-y-auto overscroll-contain p-3 text-[12px] text-white/70">
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
            <div role="tablist" aria-label="Legend sections" className="mb-2.5 flex gap-1">
              {LEGEND_SECTIONS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={entry.id === section.id}
                  onClick={() => setTab(entry.id)}
                  className={`rounded-full px-2.5 py-0.5 text-[11px] transition focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
                    entry.id === section.id
                      ? "bg-white/15 text-white"
                      : "text-white/50 hover:bg-white/10 hover:text-white/80"
                  }`}
                >
                  {entry.title}
                </button>
              ))}
            </div>

            <div role="tabpanel" aria-label={section.title}>
              <Entries entries={section.entries} />
              {section.extra ? (
                <>
                  <p className="eyebrow mb-1.5 mt-2.5">{section.extra.title}</p>
                  <Entries entries={section.extra.entries} />
                </>
              ) : null}
              {section.note ? (
                <p className="mt-2 text-[11px] leading-snug text-white/45">{section.note}</p>
              ) : null}
            </div>

            <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-white/10 pt-2.5 text-[11px] text-white/50">
              {LEGEND_CONTROLS.map(([input, action]) => (
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
