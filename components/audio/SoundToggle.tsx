"use client";

/**
 * The ambient sound switch: a small speaker in its own glass pill beside the
 * time of day, and, while sound is on, a volume slider next to it.
 *
 * Sound is OFF until the viewer turns it on. The choice is remembered in
 * this browser (`lib/client/audioSettings.ts`), but a remembered "on" does
 * not play by itself: browsers refuse audio until the page has been touched,
 * so the soundscape waits, with a small dot on the speaker, for the next
 * click, tap or key press anywhere. Clicking the speaker itself in that
 * state starts it rather than turning it off.
 *
 * WHERE IT SITS. On a wide screen the time-of-day pill is bottom centre, and
 * the speaker sits just to its right. Narrower than that the pill moves to
 * the bottom-right corner, and the speaker stacks above it; like the pill it
 * steps aside while the inspector or, on a phone, the open legend is using
 * the bottom edge. It must follow the legend in the page, whose `data-open`
 * it reads as a CSS `peer`.
 */

import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { readStoredSound, soundStorage, writeStoredSound } from "@/lib/client/audioSettings";
import { useCityStore } from "@/store/useCityStore";
import * as controller from "./controller";

const STATUS_COPY: Record<controller.SoundStatus, string> = {
  off: "Off",
  waiting: "On. Starts with your next click, tap or key press.",
  playing: "Playing",
};

/** The events that let a page start audio. */
const WAKE_EVENTS = ["pointerdown", "pointerup", "keydown", "touchend"] as const;

function SpeakerIcon({ on }: { on: boolean }) {
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
      <path d="M4 9.5h3.2L12 5.5v13l-4.8-4H4z" />
      {on ? (
        <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.5a8 8 0 0 1 0 11" />
      ) : (
        <path d="m16 9.5 5 5M21 9.5l-5 5" />
      )}
    </svg>
  );
}

export default function SoundToggle() {
  const sound = useCityStore((s) => s.sound);
  const setSound = useCityStore((s) => s.actions.setSound);
  const inspecting = useCityStore((s) => s.selectedId !== null);
  const status = useSyncExternalStore(controller.subscribeStatus, controller.getStatus, () => "off" as const);
  const root = useRef<HTMLDivElement>(null);
  const statusId = useId();

  // This browser's memory. A remembered "on" only arms the soundscape; the
  // effect below waits for the viewer's next interaction to start it.
  useEffect(() => {
    setSound(readStoredSound(soundStorage()));
  }, [setSound]);

  // On, and nothing playing yet: start at the first gesture anywhere else on
  // the page (the speaker handles its own clicks).
  useEffect(() => {
    if (!sound.on) {
      if (controller.getStatus() !== "off") void controller.stop();
      return;
    }
    if (status === "playing") return;
    if (controller.hasContext()) void controller.start(useCityStore.getState().sound.volume);
    else controller.markWaiting();

    const wake = (event: Event) => {
      if (root.current?.contains(event.target as Node)) return;
      if (!controller.primeContext()) return;
      void controller.start(useCityStore.getState().sound.volume);
    };
    for (const type of WAKE_EVENTS) window.addEventListener(type, wake, { capture: true, passive: true });
    return () => {
      for (const type of WAKE_EVENTS) window.removeEventListener(type, wake, { capture: true });
    };
  }, [sound.on, status]);

  useEffect(() => {
    controller.setVolume(sound.volume);
  }, [sound.volume]);

  // Leaving the page, or a hot reload, takes the soundscape down with it.
  useEffect(() => () => void controller.stop(), []);

  // Development only: `__repoCity.audio.stats()` for the live engine, and
  // `__repoCity.audio.render(name)` for an offline, metered render of one of
  // the level-check scenes (`scripts/audio-levels.ts`).
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const handle = (window as unknown as { __repoCity?: { audio?: unknown } }).__repoCity;
    if (!handle) return;
    handle.audio = {
      stats: controller.stats,
      async scenes() {
        return (await import("@/lib/client/audioLevels")).audioScenes().map((scene) => scene.name);
      },
      async render(name: string, seconds?: number, volume?: number, solo?: string) {
        const [{ audioScenes }, { renderScene }] = await Promise.all([
          import("@/lib/client/audioLevels"),
          import("./offline"),
        ]);
        const scene = audioScenes().find((candidate) => candidate.name === name);
        if (!scene) throw new Error(`no audio scene called ${name}`);
        return renderScene(scene, seconds, volume, solo ?? null);
      },
    };
  }, []);

  const remember = () => writeStoredSound(soundStorage(), useCityStore.getState().sound);

  const onToggle = () => {
    const { on, volume } = useCityStore.getState().sound;
    if (on && status === "waiting") {
      // On but held back: this click is the gesture it was waiting for.
      if (controller.primeContext()) void controller.start(volume);
      return;
    }
    if (!on && !controller.primeContext()) return;
    setSound({ on: !on });
    remember();
  };

  const on = sound.on;
  const title = on
    ? status === "waiting"
      ? "Ambient sound is on: click to start it"
      : "Turn ambient sound off"
    : "Turn ambient sound on";

  return (
    <div
      ref={root}
      className={`pointer-events-none absolute bottom-[3.75rem] right-3 z-20 lg:bottom-4 lg:right-auto lg:left-[calc(50%+6.75rem)] peer-data-[open=true]:max-sm:hidden ${
        inspecting ? "max-lg:hidden" : ""
      }`}
    >
      <div className="glass pointer-events-auto flex items-center gap-1 rounded-full p-1 animate-fade-in">
        {on ? (
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={sound.volume}
            onChange={(event) => {
              setSound({ volume: Number(event.target.value) });
              remember();
            }}
            aria-label="Ambient sound volume"
            title={`Volume ${Math.round(sound.volume * 100)}%`}
            className="focus-ring ml-2 h-8 w-16 cursor-pointer accent-[#ffc36b] max-lg:order-first lg:order-last lg:ml-0 lg:mr-2"
          />
        ) : null}
        <button
          type="button"
          onClick={onToggle}
          aria-label="Ambient sound"
          aria-pressed={on}
          aria-describedby={statusId}
          title={title}
          className={`focus-ring relative flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
            on ? "bg-white/15 text-accent ring-1 ring-white/15" : "text-white/55 hover:bg-white/10 hover:text-white"
          }`}
        >
          <SpeakerIcon on={on} />
          {on && status === "waiting" ? (
            <span className="absolute right-1 top-1 h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden="true" />
          ) : null}
        </button>
        <span id={statusId} className="sr-only" aria-live="polite">
          {STATUS_COPY[on ? status : "off"]}
        </span>
      </div>
    </div>
  );
}
