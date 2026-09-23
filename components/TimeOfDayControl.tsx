"use client";

/**
 * The time-of-day control (Robert, 2026-09-23: "Can we add different time of
 * day selection as well, like morning, afternoon, evening and nighttime?").
 *
 * Five segments in one small glass pill: Auto, then a sunrise, a sun, a
 * sunset and a moon. Auto is the hour the city has always inferred from its
 * repository; the other four are the viewer's own. The sky travels to a new
 * choice over a second and a half (`components/city/sky.tsx`).
 *
 * WHERE IT SITS. On a wide screen, bottom centre: the identity block, the
 * health card, the legend and the inspector all live in the corners and down
 * the right-hand rail, and the middle of the bottom edge is the one place
 * none of them reaches. Narrower than that the corners crowd the middle, so
 * it moves to the bottom-right corner, which is free until something is
 * inspected, and steps aside while the inspector (a bottom sheet on a phone)
 * or, on a phone, the open legend is using the bottom edge. It must follow
 * the legend in the page, whose `data-open` it reads as a CSS `peer`.
 *
 * It is a radio group: one tab stop, arrow keys to move between hours (the
 * choice follows the focus, as radio groups do), and the HUD's focus ring.
 *
 * The choice is remembered in this browser, and a `?time=` in the address
 * overrides it, so a link can share the night (`lib/client/timeSetting.ts`).
 */

import { useEffect, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  TIME_SETTINGS,
  browserStorage,
  initialTimeSetting,
  searchWithTime,
  timeFromSearch,
  writeStoredTime,
  type TimeSetting,
} from "@/lib/client/timeSetting";
import { useCityStore } from "@/store/useCityStore";

/** The line that explains Auto, on hover and to a screen reader. */
export const AUTO_EXPLAINED =
  "Auto: the hour follows the repository. The busier it is, the later in the afternoon; an archived one stays at a cool midday.";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** A half sun on the horizon with its rays, and an arrow up or down. */
function HorizonSun({ rising }: { rising: boolean }) {
  return (
    <Icon>
      <path d="M17 18a5 5 0 0 0-10 0" />
      <path d="M3 18h1.5M19.5 18H21M5.6 12.6l1 1M18.4 12.6l-1 1" />
      <path d="M3 21.5h18" />
      <path d={rising ? "M12 10V3M9 5.5 12 2.5l3 3" : "M12 2.5V10M9 7l3 3 3-3"} />
    </Icon>
  );
}

const ICONS: Record<Exclude<TimeSetting, "auto">, ReactNode> = {
  morning: <HorizonSun rising />,
  afternoon: (
    <Icon>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </Icon>
  ),
  evening: <HorizonSun rising={false} />,
  night: (
    <Icon>
      <path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a6.8 6.8 0 0 0 11 11Z" />
    </Icon>
  ),
};

const LABELS: Record<TimeSetting, string> = {
  auto: "Auto",
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
};

export default function TimeOfDayControl() {
  const setting = useCityStore((s) => s.timeSetting);
  const setTimeSetting = useCityStore((s) => s.actions.setTimeSetting);
  const inspecting = useCityStore((s) => s.selectedId !== null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  // The address first, then this browser's memory. Restored, not chosen: the
  // sky is simply there, with no sweep across the day on load.
  useEffect(() => {
    const restored = initialTimeSetting(window.location.search, browserStorage());
    if (restored !== useCityStore.getState().timeSetting) setTimeSetting(restored, "cut");
  }, [setTimeSetting]);

  const choose = (next: TimeSetting) => {
    if (next === useCityStore.getState().timeSetting) return;
    setTimeSetting(next, "animate");
    writeStoredTime(browserStorage(), next);
    // A shared link that named an hour keeps naming the one on screen, so a
    // reload or a re-share shows what the viewer chose.
    const { pathname, search, hash } = window.location;
    if (timeFromSearch(search) !== null) {
      window.history.replaceState(window.history.state, "", `${pathname}${searchWithTime(search, next)}${hash}`);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TIME_SETTINGS.length - 1;
    const target =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? index === last
          ? 0
          : index + 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? index === 0
            ? last
            : index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (target === null) return;
    event.preventDefault();
    choose(TIME_SETTINGS[target]);
    buttons.current[target]?.focus();
  };

  return (
    <div
      className={`pointer-events-none absolute bottom-3 right-3 z-20 lg:bottom-4 lg:right-auto lg:left-1/2 lg:-translate-x-1/2 peer-data-[open=true]:max-sm:hidden ${
        // Below the wide layout the inspector takes this corner. On a phone
        // the open legend spans the bottom edge, so the control steps aside
        // for it too (the legend is its peer in app/page.tsx).
        inspecting ? "max-lg:hidden" : ""
      }`}
    >
      <div
        role="radiogroup"
        aria-label="Time of day"
        className="glass pointer-events-auto flex items-center gap-0.5 rounded-full p-1 animate-fade-in"
      >
        {TIME_SETTINGS.map((option, index) => {
          const checked = option === setting;
          return (
            <button
              key={option}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={option === "auto" ? AUTO_EXPLAINED : LABELS[option]}
              title={option === "auto" ? AUTO_EXPLAINED : LABELS[option]}
              tabIndex={checked ? 0 : -1}
              onClick={() => choose(option)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`focus-ring flex h-8 min-w-8 items-center justify-center rounded-full transition-colors ${
                option === "auto" ? "px-3 text-[10px] font-semibold uppercase tracking-[0.16em]" : "px-2"
              } ${
                checked
                  ? "bg-white/15 text-accent ring-1 ring-white/15"
                  : "text-white/55 hover:bg-white/10 hover:text-white"
              }`}
            >
              {option === "auto" ? LABELS.auto : ICONS[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
