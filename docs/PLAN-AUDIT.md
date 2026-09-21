# Plan audit — 2026-09-21

Audit of `docs/PLAN.original.md`. The working plan with every change applied is `PLAN.md` at the repo root. `diff docs/PLAN.original.md PLAN.md` shows the exact edits.

Verdict: the original plan is strong on product thinking, scope discipline, and Hackyard compliance. Its gaps are almost all in the layer between "what" and "how": it does not define the data contracts, the streaming mechanism, the concrete formulas, or the caching that a set of parallel agents needs to build without inventing incompatible answers. Those are now filled in.

## A. Time-sensitive findings (need Robert)

| # | Finding | Severity | Action |
|---|---|---|---|
| A1 | The GitHub repo `Robertg761/Repo-City` already exists (created 18:21 UTC today, after kickoff, empty) but is **private**. The plan requires public. | High | `gh repo edit Robertg761/Repo-City --visibility public --accept-visibility-change-consequences` when you approve |
| A2 | Check-in closed at kickoff (18:00 UTC). The plan never asks whether it was actually done. | High | Confirm on Hackyard. If the spot was released, rejoin before 2026-09-23 18:00 UTC |
| A3 | Monday is a half day (kickoff 3:30 PM NDT). The plan's Monday task list assumes a full day. | Medium | Reframed as milestones; parallel agents absorb it (section 72) |
| A4 | The model declaration example in the plan is a placeholder. The model that wrote the original plan is unknown to me. | Medium | Fill in `AI_MODELS.md` |
| A5 | Vercel is implied but never named, and the Vercel CLI is not installed locally. | Medium | Confirm hosting target and account (section 74) |

## B. Technical gaps found and fixed in PLAN.md

| # | Gap in original | Fix |
|---|---|---|
| B1 | No data contracts. Six workstreams would each invent their own `RepositorySnapshot`, `RepoAnalysis`, `CityModel` shapes. | Section 71 defines all types; they are written first in W0 and frozen |
| B2 | Pipeline diagram never says which layer runs on the server and which in the browser. | Section 34: server produces compact `RepoAnalysis`; browser runs the generator. Fixture and live paths share code |
| B3 | Loading UI promises factual progress ("4,218 files mapped") but no mechanism delivers progress from a single API call. | Section 44: NDJSON streaming response with fixed stage ids; `maxDuration = 60` |
| B4 | "Cache temporarily" has no mechanism; serverless instances do not share memory. Hosted app runs on Robert's tokens during voting. | Section 30: in-memory TTL cache plus fetch-level revalidate, per-IP limit, `AI_ENABLED` kill switch, `AI_MAX_PER_HOUR`, committed fixture fallback for demo repos |
| B5 | GitHub issues endpoint returns PRs; tree endpoint truncates; 202/204 empties. None mentioned. Classic sources of Tuesday-night bugs. | Section 29: endpoint table with request count (about 15) and a gotcha list |
| B6 | Merged PRs ("fresh merged PR = new building") require a fetch the ingestion list does not include. | Section 13 and 29: `pulls?state=closed&sort=updated` |
| B7 | Health weights are given but sub-scores are undefined, so two agents would produce two different scorers. | Section 23: concrete 0..1 formulas per category; stars and forks explicitly excluded |
| B8 | Issue ranking lists factors without a formula or thresholds for the four visual states. | Section 11: score formula, state rules, placement rule, rule-derived "why this exists" text |
| B9 | CI state names are prose; no derivation from workflow runs. | Section 14: derivation table plus non-Actions CI detection |
| B10 | Building selection ("75 to 300") has no algorithm; large repos need directory-level buildings. | Section 9: adaptive granularity, scoring, per-district minimum |
| B11 | District count is unbounded; monorepos with 40 top-level dirs would be unreadable. | Section 8: 3 to 8 districts, Outskirts catch-all, AI may rename but not restructure |
| B12 | Camera focus and limits left to implementation; hand-rolled tweening is a common time sink. | Section 5: drei `CameraControls` with `setLookAt` |
| B13 | Instanced buildings plus per-object click handlers conflict. | Section 38: `instanceId` to entity map, tint-based highlight |
| B14 | Error copy distinguishes "private" from "missing", but GitHub returns 404 for both. | Section 60: merged message; added timeout and large-repo cases |
| B15 | AI adapter unspecified. | Section 28: `@anthropic-ai/sdk`, `claude-opus-5` default via `AI_MODEL`, structured outputs, low effort, 25 s timeout, refusal fallbacks, 25k-token input budget, evidence paths validated against the tree |
| B16 | No automated tests anywhere in the plan. Agents need an executable definition of done. | Section 73: Vitest suite for pure logic, per-milestone gates |
| B17 | Monday's "hardcoded" fake data would be throwaway. | Section 50: fixture JSON conforming to the real types |
| B18 | Reference repo set has categories but no candidates. | Section 59: named candidates per category |
| B19 | Secrets section lacks a scan step and an example env file. | Section 31: `.env.example`, secret scan in the Friday audit |
| B20 | Generation animation needs per-entity timing data. | `appearAt` field on every entity |
| B21 | Layout stages are listed but region allocation is unspecified. | Section 36: squarified treemap on sqrt(building count), ring road, reserved civic slots |
| B22 | Writeup draft length unknown. | Measured: 341 characters |

## C. Things I checked and left alone

- Kickoff and deadline conversions to NDT (UTC-2:30) are correct.
- The One Screen internal rule and the "avoid" list are sound and stricter than needed. No change.
- Priorities P0 to P3 and the non-goals list are right. Time Machine stays P3.
- Health weights (30/25/20/15/10) are reasonable; only the sub-scores were missing.
- Stack choice (Next.js, R3F, drei, Zustand, Zod) is appropriate for a four-day solo build with agents.

## D. Risks that remain after the fixes

1. **AI cost exposure during voting.** Resolved 2026-09-21: Robert declined runtime API spend. The hosted demo runs with `AI_PROVIDER=none`; the adapter is multi-provider for self-hosters; reference repos get agent-curated interpretations committed as fixtures (PLAN.md section 28).
2. **Vercel function timeout.** The plan sets `maxDuration = 60`; if the account plan enforces a lower ceiling, the AI stage must move to a second request. W2 verifies this on the first deploy.
3. **Merge conflicts between W1 and W6.** Both touch UI. Ownership is split by file (canvas versus overlays) and the store shape is fixed in W0, which should keep conflicts small.
4. **Look and feel.** No amount of contract work makes the city beautiful. Thursday's polish pass is the only budget for that; the schedule protects it by freezing features Thursday night.
