# Repo City

Paste any public GitHub repository and watch it become a living 3D city. Code becomes
architecture, pull requests become construction, CI becomes infrastructure, and unresolved
issues leave visible scars on the world. Fly through the entire project without ever leaving
one screen.

Built for **Hackyard Yard #3 — "One Screen."** Repo City is a single persistent 3D city
viewport: you can orbit, zoom, fly in and inspect anything you find, but the application never
navigates away from the city. There is exactly one route.

## Setup

```bash
pnpm install
cp .env.example .env.local   # fill in your own tokens; never commit this file
pnpm dev
```

Then open http://localhost:3000.

Other scripts: `pnpm build`, `pnpm start`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm fixture` (regenerates `fixtures/sample.analysis.json`).

## Environment variables

All credentials are server-side only. Nothing here is ever exposed with `NEXT_PUBLIC_`.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | yes | — | Fine-grained PAT, public repository read only. Raises the GitHub API rate limit. |
| `AI_PROVIDER` | no | `none` | `none`, `anthropic`, `openai`, `google` or `openai-compatible`. The hosted demo runs with `none`; the city is built deterministically either way. |
| `AI_MODEL` | no | — | Model id for the chosen provider. |
| `AI_API_KEY` | no | — | Key for the chosen provider. Not needed when `AI_PROVIDER=none`. |
| `AI_BASE_URL` | no | — | Endpoint for `openai-compatible` providers such as Ollama or LM Studio. |
| `AI_MAX_PER_HOUR` | no | `60` | Cap on AI calls per instance per hour. |
| `FIXTURE_FALLBACK` | no | `true` | Serve a committed snapshot when GitHub rate-limits a demo repository. |

## AI usage

Yard #3 is open-model. The runtime AI pass is optional and ships disabled. The full
declaration lives in [AI_MODELS.md](./AI_MODELS.md).

## Status

Work in progress during the Yard #3 build window. The full specification is in
[PLAN.md](./PLAN.md); this README is finished on submission day.
