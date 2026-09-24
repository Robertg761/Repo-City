# Hackyard Yard #3 submission material

Everything the submission form needs, in the order the form asks for it.
Refreshed 2026-09-23 against `main` at v0.7.0 (`3dca27a` and later): settlement tiers, every
open issue and PR drawn, time of day, the tour, ambient sound and the low-end hardening.

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

Before submitting, open it in a private window and check that the version in the top-left
corner of the HUD reads `v0.7.0` or later. An older deployment has no villages, no tour and no
time-of-day pill, and the writeup below would describe features voters cannot find.

---

## 3. Writeup (500 character maximum)

Paste exactly the block between the markers, markers excluded.

<!-- WRITEUP START -->
Repo City turns any public GitHub repo into a 3D city on one screen. Files are buildings, folders are districts, and every open issue and PR is drawn: fires, crashes and roadblocks for issues, scaffolding and trenches for PRs. Small repos become villages, giants become metropolises. Click anything to see the real GitHub record, switch to night, or press Tour for a one-minute fly-through. One route, no page changes. Try honojs/hono, then facebook/react.

https://repo-city-five.vercel.app
<!-- WRITEUP END -->

**Character count: 491** (9 characters of slack under the 500 limit).

It leads with the theme ("on one screen") and closes on it ("One route, no page changes"),
and in between names the three things a voter remembers: every issue and PR as an object in
the street, villages to metropolises, and the tour.

The text is pure ASCII, so `wc -m` and `wc -c` agree at 491 and the count does not depend on
whether the form counts characters, bytes or UTF-16 units. An em dash, a curly quote or an
emoji would each change that, so re-count after any edit. From the repository root:

```bash
printf '%s' "$(awk '/WRITEUP[ ]START/{f=1;next} /WRITEUP[ ]END/{f=0} f' docs/SUBMISSION.md)" | wc -m
```

The `[ ]` in each pattern stops the command from matching its own text in this file. The
blank line and the URL are part of what gets pasted, so they are counted;
`printf '%s' "$(...)"` trims only the trailing newline.

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
- Claude Opus 5.5 (claude-opus-5-5) - orchestration, review, integration and implementation
  sub-agents from the enhancement round onward: settlement tiers, every issue and PR drawn,
  time of day, the tour, ambient sound, low-end hardening and the submission material.
- [Robert: name the model used to draft the original plan before kickoff, or say "none".]

Runtime, inside the shipped product:
- None. The hosted demo runs with AI_PROVIDER=none. Every number in the city is computed
  deterministically from the GitHub API. The architecture-interpretation feature is a real,
  provider-agnostic adapter (Anthropic, OpenAI, Google or any OpenAI-compatible endpoint) for
  anyone who deploys their own copy, but it ships disabled, and the demo serves committed
  curated interpretations for the reference repositories instead.

Every commit names its model in a Co-Authored-By trailer. No AI receipts are being submitted
beyond this declaration and the git history; Yard #3 lists receipts as optional.
```

**Before pasting:** replace the bracketed line. AI_MODELS.md still carries a `[TO CONFIRM]`
entry for the model that drafted the plan before kickoff, and only Robert can resolve it.

---

## 5. Screenshot

```
docs/screenshot.jpg
```

1600 x 1000 JPEG, 350 KB, captured on a real GPU (ANGLE Vulkan) from v0.6.0: `facebook/react`
surveyed live, drawn as the metropolis "Greater react" at evening, legend folded, camera
lowered to a three-quarter aerial.

In one frame it shows the settlement tier, five labelled districts with their real folder
paths, the tower skyline, the motorway ring and highways out, farmland at the edges,
construction cranes, the civic centre, the fire station and the transit station, the chip
"500 of 514 pull requests on the streets" and the health card reading `85 Thriving`.

This is the image Hackyard puts on the project card, so it does most of the explaining. Upload
this file. `docs/screenshot.png` is the same shot at 1200 x 750 for the link preview
(`og:image` in `app/layout.tsx`); do not upload that one.

A second set in `docs/screenshots/` shows the tiers side by side (village, town, city), the
metropolis at night, a crowd object with the inspector open, a tour frame and the phone
inspector. Use any of them if the form takes more than one image.

---

## 6. Demo video

Optional per Hackyard, strongly recommended, and treated as required here. Shot list,
narration and recording settings: [DEMO-SCRIPT.md](./DEMO-SCRIPT.md). 60-90 seconds.
Upload to YouTube, Vimeo or Loom, the sources Hackyard embeds inline.

---

## What to paste where

Mirrors PLAN.md section 0.13. Work top to bottom.

- [ ] **Confirm the Yard spot is still held.** Section 0.12: check-in closed at kickoff. If it
      was released, rejoin before 2026-09-23 18:00 UTC, which counts as check-in.
- [ ] **Repository is public.** `https://github.com/Robertg761/Repo-City`. Check in a logged-out
      browser, not just your own.
- [ ] **Repository URL field** <- section 1.
- [ ] **Writeup field** <- the block in section 3. Confirm the form's own counter agrees with 491
      and does not show it over 500.
- [ ] **AI model declaration field** <- the block in section 4, with the bracketed line replaced.
- [ ] **Screenshot upload** <- `docs/screenshot.jpg`. Check the preview renders and is not
      cropped into unreadability on the project card.
- [ ] **Demo video URL** <- the YouTube / Vimeo / Loom link. Play it back from the submission
      page to confirm it embeds.
- [ ] **Demo URL field** (if the form has one separate from the repo) <- section 2.
- [ ] **Submit early.** Target 12:30-13:30 Newfoundland time on Friday 25 September. The
      submission can be edited while the Yard is live and locks when voting opens, and the
      earliest submission wins an exact vote tie (sections 0.14, 0.17, 0.18).

### Pre-submission checks that are not form fields

- [ ] **Production is on the latest `main`.** The HUD's top-left corner shows the version and
      short SHA. It must be v0.7.0 or later.
- [ ] **Walk the live demo once, as a voter would**, in a private window at 1600 x 1000:
      type `honojs/hono`, click a crowd object, switch to night and back, press Tour and let it
      finish, then Analyze another repo with `sindresorhus/p-limit` (village) and
      `facebook/react` (metropolis). Then load `/?tour=1`, survey a repository and check the
      tour starts on its own once the city stands. Repeat the survey and a click on a phone.
- [ ] `FIXTURE_FALLBACK` is set to `true` in the Vercel project's environment variables.
      **It is opt-in: unset means off.** If it is unset, the fixture fallback that keeps the
      demo alive through a GitHub rate limit during voting is silently disabled. See
      [QA-2026-09-21.md](./QA-2026-09-21.md), bug 1.
- [ ] `AI_PROVIDER` is `none` (or unset) in Vercel, so the declaration in section 4 stays true.
- [ ] `GITHUB_TOKEN` in Vercel is a fine-grained token with public-repository read only, and
      has not expired. The whole demo dies without it. The settlement-era survey pages through
      up to 1,000 issues and 500 PRs, so it spends more of the token's hourly budget per
      uncached repository than v0.3 did; the 15-minute cache and the fixture fallback absorb
      repeat visits.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass on `main`.
- [ ] Secret scan is clean (`git grep -nIE 'ghp_|github_pat_|sk-ant-'`), `.env.local` is not
      tracked, and no `NEXT_PUBLIC_` variable holds a credential.
- [ ] The link preview works. `app/layout.tsx` points `og:image` at
      `https://raw.githubusercontent.com/Robertg761/Repo-City/main/docs/screenshot.png`, which
      shows the new shot only once this work is merged to `main` and pushed. Open that URL
      after pushing and check it is the React metropolis, not the old hono shot.
