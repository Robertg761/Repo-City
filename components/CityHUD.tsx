"use client";

/**
 * Top-left identity block and top-right health card (PLAN.md sections 40, 23,
 * 24, 25 and 19).
 *
 * The health readout is framed throughout as Repo City's visualisation of the
 * repository, not an audit of it: the band names come from section 24, the
 * confidence line from section 25, and an archived repository is called
 * "Archived repository", never "bad repository" (section 19).
 */

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  attentionChips,
  cityPopulation,
  describeRepository,
  explainPopulation,
  queueChip,
  scoreLines,
} from "@/lib/client/descriptors";
import type { RepoAnalysis, RepoMetrics } from "@/types/analysis";
import type { SettlementInfo } from "@/types/city";
import { useCityStore } from "@/store/useCityStore";

/** Injected at build time by next.config.ts; see the version badge below. */
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "";

const BAND_TONES: Record<RepoMetrics["health"]["band"], string> = {
  Critical: "text-rose-300",
  Struggling: "text-orange-300",
  Mixed: "text-accent",
  Healthy: "text-emerald-300",
  Thriving: "text-emerald-200",
};

const CONFIDENCE_LABELS = { low: "Low", medium: "Medium", high: "High" } as const;

const SHADOW = "drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]";

/**
 * A line of HUD text that explains itself. A mouse reads the note on hover,
 * a keyboard on focus, and a finger taps to open it and taps again (or
 * anywhere else) to close it: phones have no hover, and a hover-only note
 * would be out of reach there.
 */
function Explained({
  children,
  note,
  className,
  align = "left",
}: {
  children: ReactNode;
  note: ReactNode;
  className: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const noteId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className={`group pointer-events-auto relative flex ${align === "right" ? "justify-end" : ""}`}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-describedby={noteId}
        className={`cursor-help text-left underline decoration-dotted underline-offset-4 focus:outline-none ${className}`}
      >
        {children}
      </button>
      {/* Tailwind's hover variant only applies on devices that can hover, so
          a tap never leaves the note stuck open behind a sticky hover, and
          keyboard focus shows it without a mouse click doing the same. */}
      <div
        id={noteId}
        role="tooltip"
        className={`glass pointer-events-none absolute top-full z-30 mt-1.5 w-64 max-w-[calc(100vw-2rem)] p-3 text-left text-[11px] normal-case leading-relaxed tracking-normal text-white/75 ${
          align === "right" ? "right-0" : "left-0"
        } ${open ? "block" : "hidden group-hover:block group-has-[:focus-visible]:block"}`}
      >
        {note}
      </div>
    </div>
  );
}

function HealthCard({ analysis }: { analysis: RepoAnalysis }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const { health, confidence } = analysis.metrics;
  const population = cityPopulation(analysis.metrics);

  return (
    <div className="glass pointer-events-auto relative w-[min(16.5rem,52vw)] p-4 text-right animate-fade-in">
      <p className="eyebrow">City health</p>

      <div className="mt-1 flex items-baseline justify-end gap-2">
        <span className="text-5xl font-light leading-none tabular-nums text-white">
          {health.score}
        </span>
        <span className={`text-sm font-medium ${BAND_TONES[health.band]}`}>{health.band}</span>
      </div>

      {/* Confidence with its reasons on hover or keyboard focus (section 25). */}
      <div className="group relative mt-1 flex justify-end">
        <button
          type="button"
          className="cursor-help text-[11px] text-white/60 underline decoration-dotted underline-offset-4 hover:text-white/90 focus-visible:text-white/90 focus:outline-none"
        >
          Confidence: {CONFIDENCE_LABELS[confidence.level]}
        </button>
        <div className="glass pointer-events-none absolute right-0 top-6 z-30 hidden w-64 p-3 text-left text-[11px] leading-relaxed text-white/75 group-hover:block group-focus-within:block">
          <p className="eyebrow mb-1.5">How certain is this?</p>
          <ul className="space-y-1">
            {confidence.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* The city's own population, derived from contributors and commits
          (PLAN.md section 17). It is deliberately a city fact, and it says so
          when asked. */}
      <div className="group relative mt-2 flex justify-end">
        <button
          type="button"
          className="cursor-help text-[11px] text-white/60 underline decoration-dotted underline-offset-4 hover:text-white/90 focus-visible:text-white/90 focus:outline-none"
        >
          Population {population.toLocaleString("en-US")}
          {analysis.metrics.archived ? " (last census)" : ""}
        </button>
        <div className="glass pointer-events-none absolute right-0 top-6 z-30 hidden w-64 p-3 text-left text-[11px] leading-relaxed text-white/75 group-hover:block group-focus-within:block">
          {explainPopulation(analysis.metrics)}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-1.5">
        {describeRepository(analysis.metrics).map((chip) => (
          <span key={chip} className="chip">
            {chip}
          </span>
        ))}
      </div>

      {/* Stars and forks sit apart from the descriptors on purpose: they are
          attention, and attention is not quality (PLAN.md sections 21, 22). */}
      <div className="group relative mt-2 flex flex-wrap justify-end gap-1.5">
        {attentionChips(analysis.repo).map((chip) => (
          <span key={chip} className="chip cursor-help">
            {chip}
          </span>
        ))}
        <div className="glass pointer-events-none absolute right-0 top-7 z-30 hidden w-60 p-3 text-left text-[11px] leading-relaxed text-white/75 group-hover:block">
          Attention, not quality. Stars add visitor traffic and forks add
          highways leaving the city; neither one moves the health score.
        </div>
      </div>

      {analysis.source === "fixture" ? (
        <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-white/40">
          Cached snapshot
        </p>
      ) : null}

      {/* What the survey could not do: a budget ran low, a page failed, the
          tree was capped. Facts about this survey, not about the repository. */}
      {analysis.warnings.length > 0 ? (
        <div className="mt-2">
          <Explained
            align="right"
            className="text-[11px] text-white/60 hover:text-white/90 focus-visible:text-white/90"
            note={
              <>
                <p className="eyebrow mb-1.5">Survey notes</p>
                <ul className="space-y-1">
                  {analysis.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </>
            }
          >
            {analysis.warnings.length === 1
              ? "1 survey note"
              : `${analysis.warnings.length.toLocaleString("en-US")} survey notes`}
          </Explained>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setShowBreakdown((open) => !open)}
        className="mt-3 text-[11px] text-white/55 transition hover:text-white focus-visible:text-white focus:outline-none"
        aria-expanded={showBreakdown}
      >
        How is this scored? {showBreakdown ? "−" : "+"}
      </button>

      {/* The breakdown floats beside the card rather than growing it, so the
          inspector below always starts in the same place. */}
      {showBreakdown ? (
        <div className="glass absolute right-0 top-full z-40 mt-2 max-h-[60vh] w-72 space-y-2.5 overflow-y-auto p-3 text-left sm:right-full sm:top-0 sm:mr-2 sm:mt-0">
          <p className="eyebrow">What the city is reading</p>
          {scoreLines(analysis).map(({ key, label, weight, value, inputs }) => (
            <div key={key}>
              <div className="flex items-baseline justify-between gap-2 text-[11px] text-white/65">
                <span>{label}</span>
                <span className="tabular-nums text-white/45">{weight}%</span>
              </div>
              <div className="mt-1 h-1 rounded-full bg-white/12">
                <div
                  className="h-1 rounded-full bg-accent"
                  style={{ width: `${Math.min(100, Math.max(0, Math.round(value * 100)))}%` }}
                />
              </div>
              {/* The readings behind the bar, so the number can be checked
                  against the repository rather than believed. */}
              <p className="mt-1 text-[10px] leading-relaxed text-white/45">
                {inputs.join(" · ")}
              </p>
            </div>
          ))}
          <p className="pt-1 text-[10px] leading-relaxed text-white/45">
            Repo City turns public repository signals into a city. This is a visualization, not
            a software audit. Stars and forks are not part of the score.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * "Town of zustand" under the repository link (PLAN.md 76.10), with the rule
 * that sized it one hover or one tap away.
 */
function SettlementLine({ settlement }: { settlement: SettlementInfo }) {
  return (
    <div className="mt-1">
      <Explained
        note={settlement.reason}
        className={`text-[10px] uppercase tracking-[0.2em] text-white/90 decoration-white/40 hover:text-white focus-visible:text-white ${SHADOW}`}
      >
        {settlement.name}
      </Explained>
    </div>
  );
}

/**
 * "1,000 of 21,011 issues on the streets", shown only when some open issues
 * or pull requests wait in the queue. Tapping it opens the queue in the
 * inspector, which is where the counts are explained.
 */
function QueueChip({ label }: { label: string }) {
  const select = useCityStore((s) => s.actions.select);
  return (
    <button
      type="button"
      onClick={() => select("overflow")}
      title="Show the queue at the limits"
      className="pointer-events-auto mt-2 block rounded-2xl bg-[#080c12]/60 px-2.5 py-1 text-left text-[11px] leading-snug text-white/85 ring-1 ring-white/12 backdrop-blur-sm transition hover:bg-[#080c12]/75 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {label}
    </button>
  );
}

export default function CityHUD() {
  const analysis = useCityStore((s) => s.analysis);
  const phase = useCityStore((s) => s.phase);
  const settlement = useCityStore((s) => s.city?.settlement);
  const queue = useCityStore((s) => queueChip(s.city?.overflow));

  return (
    <>
      {/* On a phone the identity block and the health card sit below the repo
          control rather than beside it; there is no room for three columns.
          One step above the health card, so the settlement note can open
          over it on a narrow screen instead of sliding underneath. */}
      <div className="pointer-events-none absolute left-4 top-[7rem] z-[21] max-w-[min(18rem,calc(48vw-2.5rem))] select-none sm:top-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
          Repo City
          <span
            className="ml-2 align-middle text-[9px] font-medium normal-case tracking-[0.12em] text-white/55"
            title={BUILD_SHA ? `build ${BUILD_SHA}` : undefined}
          >
            v{APP_VERSION}
            {BUILD_SHA ? ` · ${BUILD_SHA}` : ""}
          </span>
        </p>
        {analysis ? (
          <a
            href={analysis.repo.url}
            target="_blank"
            rel="noreferrer noopener"
            /* An external link out to GitHub, not in-app navigation: the city
               screen stays exactly where it is (PLAN.md section 0.2). */
            className="pointer-events-auto mt-1 inline-block truncate text-sm text-white/85 underline decoration-white/25 underline-offset-4 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)] transition hover:text-white hover:decoration-white/60"
          >
            {analysis.repo.fullName}
          </a>
        ) : (
          <p className="mt-1 text-sm text-white/70 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            {phase === "analyzing" ? "surveying repository" : "no repository surveyed"}
          </p>
        )}
        {analysis && settlement ? <SettlementLine settlement={settlement} /> : null}
        {analysis?.repo.archived ? (
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-accent drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            Archived repository
          </p>
        ) : null}
        {analysis && queue ? <QueueChip label={queue} /> : null}
      </div>

      <div className="pointer-events-none absolute right-4 top-[7rem] z-20 flex justify-end sm:top-4">
        {analysis ? (
          <HealthCard analysis={analysis} />
        ) : (
          <div className="glass w-[9.5rem] p-4 text-right">
            <p className="eyebrow">City health</p>
            <p className="mt-1 text-4xl font-light leading-none text-white/35">
              {phase === "analyzing" || phase === "building" ? "··" : "––"}
            </p>
          </div>
        )}
      </div>
    </>
  );
}
