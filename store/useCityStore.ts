"use client";

/**
 * The single client-side store (PLAN.md section 71.4). Keep it small: the city
 * is the product, not the state tree.
 *
 * `analyze()` streams `/api/analyze` (section 44). Stage statuses come only
 * from the events the server sends - there is no timer, and nothing is marked
 * done before the work it describes has happened.
 *
 * Typing `fixture` loads `fixtures/sample.analysis.json` instead. That escape
 * hatch is how the overlays are developed and screenshotted while the API and
 * the city generator are still being built in other worktrees. In development,
 * `backlog` loads the synthetic backlog fixture and `?tier=` forces the
 * settlement tier (PLAN.md 76.11).
 */

import { create } from "zustand";
import { analyzeRepository, AnalyzeError } from "@/lib/client/analyzeStream";
import { constructedLine } from "@/lib/client/descriptors";
import { ERROR_COPY, canonicalErrorCode, errorCopyFor } from "@/lib/client/errorCopy";
import { parseRepoInput } from "@/lib/client/repoInput";
import type { RepoAnalysis, SettlementTier } from "@/types/analysis";
import { generateCity } from "@/lib/city/generator";
import type { CityModel } from "@/types/city";

export type Phase = "idle" | "analyzing" | "building" | "ready" | "error";

export type StageStatus = "pending" | "running" | "done" | "failed";

export interface Stage {
  id: string;
  label: string;
  status: StageStatus;
  detail?: string;
}

export interface CityError {
  code: string;
  message: string;
}

export interface CityStore {
  phase: Phase;
  stages: Stage[];
  analysis: RepoAnalysis | null;
  city: CityModel | null;
  selectedId: string | null;
  hoveredId: string | null;
  error: CityError | null;
  /** What the user last submitted, so the error banner can offer a retry. */
  lastInput: string | null;
  /**
   * Bumped by `returnToOverview()`. The camera rig (W1) watches this number
   * and flies back to the default composition; the value itself is meaningless.
   */
  overviewNonce: number;
  /**
   * Reserved for a future time-of-day control in the HUD. Nothing sets it and
   * nothing reads it yet: this round the renderer derives dusk from
   * `ambience.litWindowShare`, and a second source of truth for the same thing
   * would fight it. Declared so that whoever adds the toggle does not have to
   * change the store contract (PLAN.md section 71.4).
   */
  timeOfDay?: "day" | "dusk";
  actions: {
    analyze(input: string): Promise<void>;
    select(id: string | null): void;
    hover(id: string | null): void;
    returnToOverview(): void;
    dismissError(): void;
  };
}

/** The dev escape hatch input. Not advertised in the UI. */
export const FIXTURE_INPUT = "fixture";

/**
 * Development only: `fixtures/backlog.analysis.json`, the react fixture plus
 * 984 synthetic backlog issues and 490 synthetic PRs (PLAN.md 76.11). In a
 * production build this input is just an invalid repository name.
 */
export const BACKLOG_INPUT = "backlog";

/**
 * Development only: `fixtures/stress.analysis.json`, the heaviest metropolis
 * the generator allows, for the performance gate (PLAN.md 76.13).
 */
export const STRESS_INPUT = "stress";

type FixtureName = "sample" | "backlog" | "stress";

function fixtureFor(input: string): FixtureName | null {
  const lower = input.toLowerCase();
  if (lower === FIXTURE_INPUT) return "sample";
  if (process.env.NODE_ENV !== "production" && lower === BACKLOG_INPUT) return "backlog";
  if (process.env.NODE_ENV !== "production" && lower === STRESS_INPUT) return "stress";
  return null;
}

const SETTLEMENT_TIERS: readonly SettlementTier[] = ["village", "town", "city", "metropolis"];

/**
 * Development only: `?tier=village|town|city|metropolis` forces the tier the
 * generator builds, whatever the analysis says, so every tier can be seen
 * from any fixture (PLAN.md 76.11). Always `undefined` in production.
 */
export function devTierOverride(search?: string): SettlementTier | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  const query = search ?? (typeof window === "undefined" ? "" : window.location.search);
  const value = new URLSearchParams(query).get("tier")?.trim().toLowerCase();
  return SETTLEMENT_TIERS.find((tier) => tier === value);
}

/**
 * Stage ids are fixed by PLAN.md section 44; the streaming API emits exactly
 * these. Labels are placeholders until a stage reports a real `detail`.
 */
export const STAGE_TEMPLATE: readonly Omit<Stage, "status">[] = [
  { id: "discover", label: "Repository discovered" },
  { id: "tree", label: "Architecture mapped" },
  { id: "issues", label: "Open issues surveyed" },
  { id: "pulls", label: "Open pull requests surveyed" },
  { id: "ci", label: "Infrastructure detected" },
  { id: "activity", label: "Activity measured" },
  { id: "ai", label: "Mapping architecture" },
  { id: "done", label: "Constructing city" },
];

const pendingStages = (): Stage[] =>
  STAGE_TEMPLATE.map((stage) => ({ ...stage, status: "pending" }));

/**
 * One in-flight survey at a time: starting a new one aborts the old request so
 * its events can never overwrite the newer city.
 */
let inFlight: AbortController | null = null;
/** The city the in-flight survey will hand back if it fails. */
let inFlightPrevious: { analysis: RepoAnalysis | null; city: CityModel | null } | null = null;

export const useCityStore = create<CityStore>()((set, get) => ({
  phase: "idle",
  stages: [],
  analysis: null,
  city: null,
  selectedId: null,
  hoveredId: null,
  error: null,
  lastInput: null,
  overviewNonce: 0,
  actions: {
    async analyze(input: string) {
      const trimmed = input.trim();
      const fixture = fixtureFor(trimmed);

      // Client-side sanity check (section 60). An obvious typo never costs a
      // round trip, and the server re-validates whatever does get through.
      if (!fixture && !parseRepoInput(trimmed)) {
        set({
          phase: "error",
          stages: [],
          error: { code: "INVALID_URL", message: errorCopyFor("INVALID_URL") },
          lastInput: trimmed,
        });
        return;
      }

      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;

      // The city on screen when this survey started. A new survey clears the
      // stage for its own reveal, but one that fails hands the old city back
      // rather than leaving the visitor on an empty lawn (section 0.2: an
      // error never replaces the world). A survey started while another was
      // still running inherits the city that one would have restored.
      const previous = get().city
        ? { analysis: get().analysis, city: get().city }
        : (inFlightPrevious ?? { analysis: null, city: null });
      inFlightPrevious = previous;

      set({
        phase: "analyzing",
        stages: pendingStages(),
        analysis: null,
        city: null,
        selectedId: null,
        hoveredId: null,
        error: null,
        lastInput: trimmed,
      });

      const markStage = (id: string, status: StageStatus, detail?: string) => {
        if (controller.signal.aborted) return;
        const stages = get().stages;
        const known = stages.some((stage) => stage.id === id);
        set({
          stages: known
            ? stages.map((stage) => (stage.id === id ? { ...stage, status, detail } : stage))
            : // An id outside section 44's list still deserves to be shown.
              [...stages, { id, label: detail ?? id, status, detail }],
        });
      };

      try {
        const analysis = fixture
          ? await loadFixture(fixture, markStage)
          : await analyzeRepository(trimmed, {
              onStage: (event) => markStage(event.id, event.status, event.detail),
              signal: controller.signal,
            });

        if (controller.signal.aborted) return;
        set({ phase: "building", analysis });

        const city = generateCity(analysis, { tier: devTierOverride() });

        markStage("done", "done", city ? constructedLine(city.settlement) : "Placeholder city");
        set({ city, phase: "ready" });
      } catch (cause) {
        if (controller.signal.aborted) return;
        const code = cause instanceof AnalyzeError ? cause.code : "ANALYSIS_FAILED";
        if (code === "ABORTED") return;
        const message = errorCopyFor(
          code,
          cause instanceof Error ? cause.message : String(cause),
        );
        set({
          phase: "error",
          error: { code, message },
          analysis: previous.analysis,
          city: previous.city,
          // Only the step that was actually in flight failed; the ones after
          // it never ran, and a panel of eight red crosses claims work the
          // server never attempted (PLAN.md section 44).
          stages: get().stages.map((stage) =>
            stage.status === "running" ? { ...stage, status: "failed" } : stage,
          ),
        });
        // A repository that does not exist is a normal outcome the interface
        // is already handling; only a code nobody planned for is worth a red
        // stack trace in a visitor's console (QA-2026-09-21 bug 7).
        if (!(canonicalErrorCode(code) in ERROR_COPY)) {
          console.error(`Repo City: analysis of ${trimmed} failed`, cause);
        }
      } finally {
        if (inFlight === controller) {
          inFlight = null;
          inFlightPrevious = null;
        }
      }
    },

    select(id: string | null) {
      // Selecting settles the pointer question: the tooltip would otherwise
      // sit on top of the inspector describing the same thing.
      set({ selectedId: id, hoveredId: null });
    },

    hover(id: string | null) {
      set({ hoveredId: id });
    },

    returnToOverview() {
      set({
        selectedId: null,
        hoveredId: null,
        overviewNonce: get().overviewNonce + 1,
      });
    },

    dismissError() {
      set((state) => ({
        error: null,
        phase: state.phase === "error" ? (state.analysis ? "ready" : "idle") : state.phase,
      }));
    },
  },
}));

/**
 * Dev escape hatch. Marks each stage only after the fixture data backing it is
 * in hand, so the panel never shows a step that did not happen.
 */
async function loadFixture(
  name: FixtureName,
  markStage: (id: string, status: StageStatus, detail?: string) => void,
): Promise<RepoAnalysis> {
  // The backlog branch is dead code in a production build, so its half
  // megabyte of JSON never ships.
  const loaded =
    process.env.NODE_ENV !== "production" && name === "backlog"
      ? (await import("@/fixtures/backlog.analysis.json")).default
      : process.env.NODE_ENV !== "production" && name === "stress"
        ? (await import("@/fixtures/stress.analysis.json")).default
        : (await import("@/fixtures/sample.analysis.json")).default;
  const analysis = loaded as unknown as RepoAnalysis;

  markStage("discover", "done", analysis.repo.fullName);
  const { issues, pulls, scale } = analysis.metrics;
  const count = (value: number) => value.toLocaleString("en-US");
  markStage("tree", "done", `${count(scale.files)} files mapped`);
  const issueCount = issues.total ?? issues.open;
  const pullCount = pulls.total ?? pulls.open;
  markStage("issues", "done", `${count(issueCount)} open ${issueCount === 1 ? "issue" : "issues"} surveyed`);
  markStage(
    "pulls",
    "done",
    `${count(pullCount)} open ${pullCount === 1 ? "pull request" : "pull requests"} surveyed`,
  );
  markStage("ci", "done", `CI ${analysis.metrics.ci.state}`);
  markStage(
    "activity",
    "done",
    `${analysis.metrics.activity.commitsLast30d} commits in 30 days`,
  );
  markStage("ai", analysis.aiStatus === "ok" ? "done" : "failed", analysis.ai?.model);

  return analysis;
}

/** Stable action handle; safe to call outside React and in effects. */
export const useCityActions = () => useCityStore((s) => s.actions);

/**
 * Development-only console handle, e.g. `__repoCity.getState().actions.select("b-001")`.
 * It is how the overlays and the camera rig are driven before picking works,
 * and it is stripped from production builds.
 */
if (process.env.NODE_ENV !== "production" && typeof window !== "undefined") {
  (window as unknown as { __repoCity?: typeof useCityStore }).__repoCity = useCityStore;
}
