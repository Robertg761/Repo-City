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

import { useState } from "react";
import {
  attentionChips,
  cityPopulation,
  describeRepository,
  explainPopulation,
  scoreLines,
} from "@/lib/client/descriptors";
import type { RepoAnalysis, RepoMetrics } from "@/types/analysis";
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

export default function CityHUD() {
  const analysis = useCityStore((s) => s.analysis);
  const phase = useCityStore((s) => s.phase);

  return (
    <>
      {/* On a phone the identity block and the health card sit below the repo
          control rather than beside it; there is no room for three columns. */}
      <div className="pointer-events-none absolute left-4 top-[7rem] z-20 max-w-[min(18rem,42vw)] select-none sm:top-4">
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
        {analysis?.repo.archived ? (
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-accent drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
            Archived repository
          </p>
        ) : null}
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
