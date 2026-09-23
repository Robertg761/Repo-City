"use client";

/**
 * Top-centre repository entry (PLAN.md sections 3 and 40).
 *
 * Before a city exists this is a floating pill with the empty-state hint under
 * it. Once a city stands, it collapses to "Analyze another repo" and expands
 * again in place: entering another repository happens inside the same screen,
 * never through navigation (section 0.2).
 */

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useCityStore } from "@/store/useCityStore";

/**
 * One repository of each settlement size (PLAN.md 76.1), a tap away on the
 * empty stage: the fastest way to see what Repo City does, and a hint that a
 * small repository becomes a village rather than a small city.
 */
const SAMPLES = [
  { tier: "village", repo: "sindresorhus/p-limit" },
  { tier: "town", repo: "pmndrs/zustand" },
  { tier: "city", repo: "honojs/hono" },
  { tier: "metropolis", repo: "facebook/react" },
] as const;

const EXAMPLE = "github.com/facebook/react";

export default function RepoInput() {
  const [value, setValue] = useState("");
  const [expanded, setExpanded] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  const phase = useCityStore((s) => s.phase);
  const analysis = useCityStore((s) => s.analysis);
  const analyze = useCityStore((s) => s.actions.analyze);

  const busy = phase === "analyzing" || phase === "building";
  const hasCity = analysis !== null;
  const showInput = expanded || !hasCity;

  // Collapse as soon as there is a city to look at; the input is in the way of
  // the skyline otherwise. Adjusted during render rather than in an effect,
  // which is the pattern React documents for "state derived from a change".
  // A failed survey hands the old city back; the box stays open then, with
  // the input that failed in it, ready to be corrected.
  const [sawCity, setSawCity] = useState(hasCity);
  if (sawCity !== hasCity) {
    setSawCity(hasCity);
    if (hasCity && expanded && phase !== "error") setExpanded(false);
  }

  // Autofocus on load, and again whenever the user reopens the control. The
  // text is selected, so typing the next repository replaces the last one.
  useEffect(() => {
    if (!showInput || busy) return;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [showInput, busy]);

  const survey = (repo: string) => {
    if (busy) return;
    setValue(repo);
    void analyze(repo);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      inputRef.current?.focus();
      return;
    }
    void analyze(trimmed);
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex flex-col items-center px-4">
      {showInput ? (
        <div className="pointer-events-auto flex w-full max-w-[30rem] flex-col items-center animate-fade-in">
          <form
            onSubmit={onSubmit}
            className="glass flex w-full items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 transition-shadow focus-within:ring-accent/55"
          >
            <input
              ref={inputRef}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape" && hasCity) setExpanded(false);
              }}
              placeholder="Enter a GitHub repository"
              aria-label="GitHub repository"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              disabled={busy}
              className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/45 focus:outline-none disabled:opacity-60"
            />
            {/* With a city standing, the box can fold away again without a
                survey: Escape does it from the keyboard, and this does it on a
                phone, which has no Escape key. */}
            {hasCity && !busy ? (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Close"
                className="shrink-0 rounded-full px-2 py-1 text-base leading-none text-white/50 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                {"×"}
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1a1206] transition hover:bg-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Surveying" : "Survey"}
            </button>
          </form>

          <p className="mt-2 text-center text-xs text-white/70 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
            <span className="text-white/55">Example </span>
            <button
              type="button"
              onClick={() => survey(EXAMPLE)}
              disabled={busy}
              title="Survey this repository"
              className="focus-ring font-mono text-white/80 underline decoration-white/25 underline-offset-4 transition hover:text-white hover:decoration-white/70 disabled:no-underline"
            >
              {EXAMPLE}
            </button>
          </p>

          {/* Empty state, PLAN.md section 3. */}
          {!hasCity && phase === "idle" ? (
            <>
              <p className="mt-1 text-center text-xs text-white/65 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                Paste any public GitHub repository and watch it become a city.
              </p>
              {/* Not on a phone: the identity block sits right under the box
                  there, and the example above is already a tap away. */}
              <p className="mt-2 hidden flex-wrap items-center justify-center gap-1.5 text-[11px] sm:flex text-white/60 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
                <span>Or visit a</span>
                {SAMPLES.map(({ tier, repo }) => (
                  <button
                    key={tier}
                    type="button"
                    onClick={() => survey(repo)}
                    title={repo}
                    className="rounded-full bg-[#080c12]/55 px-2 py-0.5 text-white/85 ring-1 ring-white/12 backdrop-blur-sm transition hover:bg-[#080c12]/75 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    {tier}
                  </button>
                ))}
              </p>
            </>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="glass hud-button pointer-events-auto animate-fade-in px-4 py-2"
        >
          Analyze another repo
        </button>
      )}
    </div>
  );
}
