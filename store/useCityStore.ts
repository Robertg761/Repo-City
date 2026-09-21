"use client";

/**
 * The single client-side store (PLAN.md section 71.4). Keep it small: the city
 * is the product, not the state tree.
 *
 * W0 ships a fixture-backed `analyze()` so the Monday city has real data
 * flowing through the real code path. W7 replaces the body of `analyze()` with
 * the streamed `/api/analyze` call; the action name, the stage ids, and every
 * field below stay exactly as they are.
 */

import { create } from "zustand";
import type { RepoAnalysis } from "@/types/analysis";
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
  actions: {
    analyze(input: string): Promise<void>;
    select(id: string | null): void;
    hover(id: string | null): void;
    returnToOverview(): void;
  };
}

/**
 * Stage ids are fixed by PLAN.md section 44; the streaming API emits exactly
 * these. Labels are placeholders until a stage reports a real `detail`.
 */
const STAGE_TEMPLATE: readonly Omit<Stage, "status">[] = [
  { id: "discover", label: "Repository discovered" },
  { id: "tree", label: "Architecture mapped" },
  { id: "issues", label: "Issues inspected" },
  { id: "pulls", label: "Pull requests reviewed" },
  { id: "ci", label: "Infrastructure detected" },
  { id: "activity", label: "Activity measured" },
  { id: "ai", label: "Mapping architecture" },
  { id: "done", label: "Constructing city" },
];

const pendingStages = (): Stage[] =>
  STAGE_TEMPLATE.map((stage) => ({ ...stage, status: "pending" }));

/** `github.com/o/r`, `https://github.com/o/r`, `o/r` -> `o/r`. W2 owns the real parser. */
function describeInput(input: string): string {
  const trimmed = input.trim().replace(/\.git$/, "").replace(/\/+$/, "");
  const match = trimmed.match(/(?:github\.com\/)?([\w.-]+)\/([\w.-]+)/);
  return match ? `${match[1]}/${match[2]}` : trimmed;
}

export const useCityStore = create<CityStore>()((set, get) => ({
  phase: "idle",
  stages: [],
  analysis: null,
  city: null,
  selectedId: null,
  hoveredId: null,
  error: null,
  actions: {
    async analyze(input: string) {
      const target = describeInput(input);

      set({
        phase: "analyzing",
        stages: pendingStages(),
        analysis: null,
        city: null,
        selectedId: null,
        hoveredId: null,
        error: null,
      });

      const markStage = (id: string, status: StageStatus, detail?: string) => {
        set({
          stages: get().stages.map((stage) =>
            stage.id === id ? { ...stage, status, detail } : stage,
          ),
        });
      };

      try {
        // W7 replaces this with the streamed `/api/analyze` response. Until
        // then the fixture is the data source, and no stage is marked done
        // before the work it describes has actually happened.
        const loaded = (await import("@/fixtures/sample.analysis.json")).default;
        const analysis = loaded as unknown as RepoAnalysis;

        markStage("discover", "done", analysis.repo.fullName);
        markStage("tree", "done", `${analysis.metrics.scale.files} files mapped`);
        markStage("issues", "done", `${analysis.metrics.issues.open} issues inspected`);
        markStage("pulls", "done", `${analysis.metrics.pulls.open} pull requests open`);
        markStage("ci", "done", `CI ${analysis.metrics.ci.state}`);
        markStage("activity", "done", `${analysis.metrics.activity.commitsLast30d} commits in 30 days`);
        markStage("ai", analysis.aiStatus === "ok" ? "done" : "failed", analysis.ai?.model);

        set({ phase: "building", analysis });

        // TODO(W5): const city = generateCity(analysis);
        // `lib/city/generator.ts` turns the analysis into the CityModel. Until
        // that workstream lands the canvas renders its placeholder scene.
        const city: CityModel | null = null;

        markStage("done", "done", city ? "City constructed" : "Placeholder city");
        set({ city, phase: "ready" });
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : String(cause);
        set({
          phase: "error",
          error: { code: "ANALYSIS_FAILED", message },
          stages: get().stages.map((stage) =>
            stage.status === "pending" || stage.status === "running"
              ? { ...stage, status: "failed" }
              : stage,
          ),
        });
        console.error(`Repo City: analysis of ${target} failed`, cause);
      }
    },

    select(id: string | null) {
      set({ selectedId: id });
    },

    hover(id: string | null) {
      set({ hoveredId: id });
    },

    returnToOverview() {
      set({ selectedId: null, hoveredId: null });
    },
  },
}));

/** Stable action handle; safe to call outside React and in effects. */
export const useCityActions = () => useCityStore((s) => s.actions);
