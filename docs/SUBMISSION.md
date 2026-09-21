# Hackyard Yard #3 submission material

Everything the submission form needs, in the order the form asks for it.
Prepared 2026-09-21 against the live production deployment.

---

## 1. Repository URL

```
https://github.com/Robertg761/Repo-City
```

Must be public at submission time. It was made public on 2026-09-21, after kickoff
(PLAN.md section 0.9).

---

## 2. Demo URL

```
https://repo-city-five.vercel.app
```

Verified live and public on 2026-09-21. Open it in a private window before submitting
(PLAN.md section 70).

---

## 3. Writeup (500 character maximum)

Paste exactly the block between the markers, markers excluded.

<!-- WRITEUP START -->
Repo City turns any public GitHub repository into a living 3D city. Files become buildings, directories become districts, open pull requests become construction cranes, CI becomes the power plant, and unresolved issues leave burning scars in the streets. Click anything to read the real GitHub data behind it. One persistent 3D viewport: one route, no page changes, no second screen. Try honojs/hono, then atom/atom.

https://repo-city-five.vercel.app
<!-- WRITEUP END -->

**Character count: 451** (49 characters of slack under the 500 limit).

Counted with `wc -m`. The text is pure ASCII, so `wc -m` and `wc -c` agree at 451 and the
count cannot shift depending on whether the form counts characters, bytes or UTF-16 units.
Do not add an em dash, a curly quote or an emoji without re-counting — each one makes the
byte count exceed the character count.

To re-count after any edit, from the repository root:

```bash
printf '%s' "$(awk '/WRITEUP[ ]START/{f=1;next} /WRITEUP[ ]END/{f=0} f' docs/SUBMISSION.md)" | wc -m
```

The `[ ]` in each pattern stops the command from matching its own text in this file. The
blank line and the URL are part of what gets pasted, so the whole block is counted, internal
newline included; `printf '%s' "$(...)"` trims only the trailing newline.

---

## 4. AI model declaration

Yard #3 is open-model. Paste this into the model declaration field. It matches
[AI_MODELS.md](../AI_MODELS.md), which is the source of truth.

```
Built with AI coding agents throughout, which Yard #3 permits.

Development:
- Claude Fable 5.1 (claude-fable-5-1) - plan audit, orchestration, code review, integration,
  via Synara on the Claude Agent SDK.
- Claude Opus 5 (claude-opus-5) - implementation sub-agents, one per workstream, in parallel
  git worktrees. Also wrote the curated architecture interpretations in
  fixtures/interpretations/.
- [Robert: name the model used to draft the original plan before kickoff, or say "none".]

Runtime, inside the shipped product:
- None. The hosted demo runs with AI_PROVIDER=none. Every number in the city is computed
  deterministically from the GitHub API. The architecture-interpretation feature is a real,
  provider-agnostic adapter (Anthropic, OpenAI, Google or any OpenAI-compatible endpoint) for
  anyone who deploys their own copy, but it ships disabled, and the demo serves committed
  curated interpretations for the reference repositories instead.

No AI receipts are being submitted beyond this declaration and the git history; Yard #3
lists receipts as optional.
```

**Before pasting:** replace the bracketed line. AI_MODELS.md still carries a `[TO CONFIRM]`
entry for the model that drafted the plan before kickoff, and only Robert can resolve it.
That is the one factual gap in the declaration.

---

## 5. Screenshot

```
docs/screenshot.png
```

1600 x 1000 PNG, captured from the live production site in headless Chromium: `honojs/hono`
analysed, reveal finished, inspector closed, camera pulled down to a low aerial angle.

It shows, in one frame: labelled districts with their real directory paths, the skyline,
roads and traffic, two construction cranes over open pull requests, the CI power plant with
its stacks, the information centre, an incident, and the health card reading `76 Healthy`.

This is the image Hackyard uses on the project card, so it is doing most of the work of
explaining the project. Upload this file.

---

## 6. Demo video

Optional per Hackyard, strongly recommended, and treated as required here. Shot list,
narration and recording settings: [DEMO-SCRIPT.md](./DEMO-SCRIPT.md). 45-70 seconds.
Upload to YouTube, Vimeo or Loom — those are the sources Hackyard embeds inline.

---

## What to paste where

Mirrors PLAN.md section 0.13. Work top to bottom.

- [ ] **Confirm the Yard spot is still held.** Section 0.12: check-in closed at kickoff. If it
      was released, rejoin before 2026-09-23 18:00 UTC, which counts as check-in.
- [ ] **Repository is public.** `https://github.com/Robertg761/Repo-City`. Check in a logged-out
      browser, not just your own.
- [ ] **Repository URL field** <- section 1 above.
- [ ] **Writeup field** <- the block in section 3. Confirm the form's own counter agrees with 451
      and does not show it over 500.
- [ ] **AI model declaration field** <- the block in section 4, with the bracketed line replaced.
- [ ] **Screenshot upload** <- `docs/screenshot.png`. Check the preview renders and is not
      cropped into unreadability on the project card.
- [ ] **Demo video URL** <- the YouTube / Vimeo / Loom link. Play it back from the submission
      page to confirm it embeds.
- [ ] **Demo URL field** (if the form has one separate from the repo) <- section 2.
- [ ] **Submit early.** Target 12:30-13:30 Newfoundland time on Friday 25 September. The
      submission can be edited while the Yard is live and locks when voting opens, and the
      earliest submission wins an exact vote tie (sections 0.14, 0.17, 0.18).

### Pre-submission checks that are not form fields

- [ ] `FIXTURE_FALLBACK` is set to `true` in the Vercel project's environment variables.
      **It is opt-in: unset means off.** If it is unset, the fixture fallback that keeps the
      demo alive through a GitHub rate limit during voting is silently disabled. See
      [QA-2026-09-21.md](./QA-2026-09-21.md), bug 1.
- [ ] `AI_PROVIDER` is `none` (or unset) in Vercel, so the declaration in section 4 stays true.
- [ ] `GITHUB_TOKEN` in Vercel is a fine-grained PAT with public-repository read only, and has
      not expired. The whole demo dies without it.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass on `main`.
- [ ] Secret scan is clean (`git grep -nIE 'ghp_|github_pat_|sk-ant-'`), `.env.local` is not
      tracked, and no `NEXT_PUBLIC_` variable holds a credential.
- [ ] The production URL loads in a private window and renders a city for at least two
      repositories.
- [ ] The link preview works. `app/layout.tsx` points `og:image` at
      `https://raw.githubusercontent.com/Robertg761/Repo-City/main/docs/screenshot.png`, which
      only resolves once this work is merged to `main` and pushed. Open that URL in a browser
      after pushing; if it 404s, the preview card will be blank. Context in
      [QA-2026-09-21.md](./QA-2026-09-21.md), section 4.
