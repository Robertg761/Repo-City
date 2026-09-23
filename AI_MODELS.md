# AI models used during development

Hackyard Yard #3 requires an accurate model declaration at submission. Every agent that writes code appends itself here if not already listed.

## Development

- Claude Fable 5.1 (`claude-fable-5-1`) — plan audit, orchestration, code review, integration, via Synara (Claude Agent SDK)
- Claude Opus 5 (`claude-opus-5`) — implementation sub-agents for the workstreams in PLAN.md section 72, each in its own git worktree. Also wrote the curated architecture interpretations in `fixtures/interpretations/`, and the presentation and QA documents.
- Claude Opus 5.5 (`claude-opus-5-5`) — orchestration, review and integration for the second half of the enhancement round (PLAN.md section 75), plus the sub-agents that finished workstreams E2, E3 and E4 in their existing git worktrees. From then on, both the orchestrator and the implementation sub-agents for the settlements round (PLAN.md section 76: village, town, city and metropolis, and every open issue and PR drawn), the time of day, the cinematic tour, ambient sound, the low-end hardening, and the refreshed README, screenshots and submission material.
- [TO CONFIRM] model used to draft the original plan before kickoff

These are the only models that touched the code, and the git history is the receipt: every commit carries a `Co-Authored-By` trailer naming the model that wrote it.

```bash
git log --format='%b' | grep -i 'co-authored-by' | sort | uniq -c
```

## Runtime (inside the product)

- None on the hosted demo. The architecture-interpretation feature is an optional, provider-agnostic adapter (`AI_PROVIDER=none` by default). Anyone deploying their own copy can point it at Anthropic, OpenAI, Google, or an OpenAI-compatible local model.
- Curated interpretations for the twelve reference repositories in `fixtures/interpretations/` were written by the development agents listed above; each file records its `model`, and every one currently reads `claude-opus-5 (curated during development)`. They are re-grounded against the live repository tree on each request, so a stale file degrades rather than lying.
- Everything else in a city — metrics, health, confidence, districts without a curated file, building selection, layout — is computed deterministically from the GitHub API with no model involved. A repository with no curated file and no configured provider reports `aiStatus: "skipped"` and still builds a complete city.

## Not used

- No AI receipts are being collected beyond this file and the git history.
