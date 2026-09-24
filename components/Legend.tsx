"use client";

/**
 * Bottom-left legend (PLAN.md sections 40 and 76.10). It teaches the visual
 * language - the thing that makes the whole city readable - plus the camera
 * controls.
 *
 * Three short tabs rather than one long list: the city's buildings and
 * landmarks, the seven shapes an open issue takes, and the shapes and signals
 * of a pull request. Folded by default on every screen, so the first look
 * at a city is the city: folded, it is a small "Legend +" chip with the
 * camera controls under it (the controls only where there is a mouse-sized
 * screen). Opening it is remembered in this browser; on a phone, or one held
 * sideways, it still starts folded, since open it is taller than the screen
 * leaves under the identity block.
 */

import { useCallback, useState, useSyncExternalStore } from "react";
import { LEGEND_CONTROLS, LEGEND_SECTIONS, type LegendEntry } from "@/lib/client/legend";
import { readStoredLegendOpen, writeStoredLegendOpen } from "@/lib/client/legendSetting";
import { browserStorage } from "@/lib/client/timeSetting";
import { useCityStore } from "@/store/useCityStore";
import LegendGlyphTile from "@/components/LegendGlyphs";

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

/** Only this component writes the key, and its own state covers that change, so nothing to subscribe to. */
const noSubscription = () => () => {};

/** The remembered choice; `false` on the server, so hydration agrees. */
function useStoredOpen(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => readStoredLegendOpen(browserStorage()),
    () => false,
  );
}

/** The camera controls, each input a keycap. */
function Controls({ className }: { className: string }) {
  return (
    <ul className={`flex gap-x-3 gap-y-1.5 text-[11px] text-white/50 ${className}`}>
      {LEGEND_CONTROLS.map(([input, action]) => (
        <li key={input} className="flex items-baseline gap-1.5">
          <kbd className="rounded-md bg-white/[0.08] px-1.5 py-px font-sans text-[10px] leading-4 text-white/85 shadow-[inset_0_-1px_0_rgb(255_255_255/0.08)] ring-1 ring-white/12">
            {input}
          </kbd>
          {action}
        </li>
      ))}
    </ul>
  );
}

function Entries({ entries }: { entries: readonly LegendEntry[] }) {
  return (
    <ul className="space-y-2">
      {entries.map(([term, meaning, glyph]) => (
        <li key={term} className="flex items-start gap-2.5">
          {glyph ? <LegendGlyphTile glyph={glyph} /> : null}
          <div className="min-w-0 pt-px">
            <p className="text-[12px] font-medium leading-tight text-white/90">{term}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-white/50">{meaning}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Points up while folded (the legend opens upwards) and down once open. */
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`transition-transform duration-200 ${open ? "" : "rotate-180"}`}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export default function Legend() {
  const smallScreen = useSmallScreen();
  const storedOpen = useStoredOpen();
  const [override, setOverride] = useState<boolean | null>(null);
  const [tab, setTab] = useState<(typeof LEGEND_SECTIONS)[number]["id"]>("city");
  const open = override ?? (storedOpen && !smallScreen);
  const toggle = () => {
    setOverride(!open);
    writeStoredLegendOpen(browserStorage(), !open);
  };

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
      // `peer` and `data-open`: on a phone the open legend spans the bottom
      // edge, and the time-of-day control beside it steps aside.
      data-open={open ? "true" : "false"}
      className={`peer pointer-events-none absolute bottom-3 left-3 ${
        open ? "w-[min(18rem,calc(100vw-1.5rem))]" : "max-w-[calc(100vw-1.5rem)]"
      } ${
        open && smallScreen ? "z-[24]" : "z-20"
      }`}
    >
      {/* Never taller than the room under the identity block; the tabs
          scroll inside it instead. */}
      {/* Folded, one short row: the chip, then the camera controls beside
          it, which a first-time visitor needs before anything else. */}
      <div
        className={`glass pointer-events-auto max-h-[calc(100dvh-11rem)] overflow-y-auto overscroll-contain text-[12px] text-white/70 ${
          open ? "p-3" : "flex items-center gap-4 px-3 py-2"
        }`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={`focus-ring group flex items-center text-left ${open ? "w-full justify-between gap-6" : "shrink-0 gap-2"}`}
        >
          <span className="flex items-center gap-2">
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="text-accent"
            >
              <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2ZM9 4v14M15 6v14" />
            </svg>
            <span className="eyebrow transition-colors group-hover:text-white/80">Legend</span>
          </span>
          <span className="text-white/50 transition-colors group-hover:text-white">
            <Chevron open={open} />
          </span>
        </button>

        {/* From 1024px the time-of-day control moves to the bottom centre, and
            until 1280px the row of keycaps would run into it; there the open
            legend still lists them. */}
        {!open && !smallScreen ? (
          <Controls className="whitespace-nowrap border-l border-white/10 pl-4 lg:max-xl:hidden" />
        ) : null}

        {open ? (
          <div className="mt-3 animate-fade-in">
            <div
              role="tablist"
              aria-label="Legend sections"
              className="mb-3 flex gap-0.5 rounded-full bg-white/[0.06] p-0.5 ring-1 ring-white/[0.08]"
            >
              {LEGEND_SECTIONS.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  role="tab"
                  aria-selected={entry.id === section.id}
                  onClick={() => setTab(entry.id)}
                  className={`flex-1 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition focus:outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-accent ${
                    entry.id === section.id
                      ? "bg-white/15 text-accent ring-1 ring-white/15"
                      : "text-white/50 hover:bg-white/10 hover:text-white/85"
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
                  <p className="eyebrow mb-2 mt-3.5">{section.extra.title}</p>
                  <Entries entries={section.extra.entries} />
                </>
              ) : null}
              {section.note ? (
                <p className="mt-3 rounded-lg bg-white/[0.04] px-2.5 py-2 text-[11px] leading-snug text-white/55 ring-1 ring-white/[0.06]">
                  {section.note}
                </p>
              ) : null}
            </div>

            <Controls className="mt-3 flex-wrap border-t border-white/10 pt-3" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
