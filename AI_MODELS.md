# AI models used during development

Hackyard Yard #3 requires an accurate model declaration at submission. Every agent that writes code appends itself here if not already listed.

## Development

- Claude Fable 5.1 (`claude-fable-5-1`) — plan audit, orchestration, code review, integration, via Synara (Claude Agent SDK)
- Claude Opus 5 (`claude-opus-5`) — implementation sub-agents for the workstreams in PLAN.md section 72
- [TO CONFIRM] model used to draft the original plan before kickoff

## Runtime (inside the product)

- None on the hosted demo. The architecture-interpretation feature is an optional, provider-agnostic adapter (`AI_PROVIDER=none` by default). Anyone deploying their own copy can point it at Anthropic, OpenAI, Google, or an OpenAI-compatible local model.
- Curated interpretations for the reference repositories in `fixtures/interpretations/` were written by the development agents listed above; each file records its `model`.

## Not used

- No AI receipts are being collected beyond this file and the git history.
