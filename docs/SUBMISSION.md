# Hackyard Yard #3 submission material

## Status: what's left (updated 2026-09-24)

**Everything is built, deployed, recorded and documented. The only thing left is filling in
and submitting the Hackyard form.** This file holds every value the form needs, so you can
finish from any machine with a checkout of this repository.

### Left to do: only Robert can do these

1. [ ] **Confirm the Yard spot is still held** on the Hackyard site (see the checklist below).
2. [ ] **Fill in the Hackyard form**, top to bottom:
   - repository URL, [section 1](#1-repository-url)
   - demo URL, [section 2](#2-demo-url)
   - writeup, [section 3](#3-writeup-500-character-maximum)
   - AI model declaration, [section 4](#4-ai-model-declaration)
   - screenshot upload `docs/screenshot.jpg`, [section 5](#5-screenshot)
   - demo video URL, [section 6](#6-demo-video)
3. [ ] **Play the video back on the submission page** and check it embeds.
4. [ ] **Submit early: Friday 25 September, 12:30-13:30 NDT.** The hard deadline is 18:00 UTC
   (15:30 NDT). You can edit the submission until voting opens, and the earliest submission
   wins an exact tie.
5. [ ] **Optional, after submitting:** on the morning of voting, open the live demo in a private
   window and survey one repository, to confirm the GitHub token hasn't expired.

### Done, and how it was checked

- [x] **Live demo** at <https://repo-city-five.vercel.app>, on v0.7.1 plus the legend polish
      of 2026-09-24 (icons in the legend, clearer text over the city). Production serves the
      latest code commit.
- [x] **Demo video**: <https://youtu.be/dU3AJCfMiNs>, 77 s, Unlisted. It embeds, and it plays
      without signing in (checked with YouTube oEmbed).
- [x] **Repository** is public, visible logged out, with the MIT license, a description,
      the homepage link and topics set on GitHub.
- [x] **Model declaration** complete, with no open entries. Section 4 matches
      [AI_MODELS.md](../AI_MODELS.md).
- [x] **Writeup** is 491 of 500 characters, pure ASCII.
- [x] **Checks on `main`**: typecheck, lint, 2,244 tests and the production build pass.
- [x] **Secret scan** of the whole history is clean. `.env.local` is untracked, and the only
      `NEXT_PUBLIC_` variables are the version and the build SHA.
- [x] **Vercel env**: `FIXTURE_FALLBACK` and `GITHUB_TOKEN` are set, and `AI_PROVIDER` is
      unset, so the runtime is none.
- [x] **Link preview**: `og:image` resolves to the React metropolis shot, with a large Twitter card.

A copy-paste sheet with the same values, the video file, its captions and its thumbnail also
exists at `~/Repo-City-Submission/` on the build machine. It's a convenience only. Nothing in
it is missing from this file.

---

Everything the submission form needs, in the order the form asks for it.
Refreshed 2026-09-24 against `main` at v0.7.1 (`f5e9972` and later): settlement tiers, every
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

Yard #3 is open-model. The live form has no long declaration field. It asks for the model
in a 60-character box, then where it was used and an attestation that the named model was
the primary code generator. The entry is:

```
Opus 5.5 (primary), Fable 5.1, Opus 5, Sonnet 5, GPT-6 Astra
```

Where used: "an editor or coding agent". The form also has no separate demo URL field, so the
live demo reaches voters through the last line of the writeup.

The full declaration below matches [AI_MODELS.md](../AI_MODELS.md), which is the source of
truth.

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
- Claude Sonnet 5 (claude-sonnet-5) - one repository-hygiene sub-agent in v0.7.1.
- GPT-6 Astra - used a little during the build. No commit names it in a trailer.
- Original plan, drafted before kickoff: several models helped, Claude Fable 5.1
  (claude-fable-5-1) among them.

Demo video: scripted, recorded, narrated and edited by Claude Opus 5.5, driving the live site.
Narration voice: Kokoro-82M text to speech (local). Caption timing: Whisper small.en (local).

Runtime, inside the shipped product:
- None. The hosted demo runs with AI_PROVIDER=none. Every number in the city is computed
  deterministically from the GitHub API. The architecture-interpretation feature is a real,
  provider-agnostic adapter (Anthropic, OpenAI, Google or any OpenAI-compatible endpoint) for
  anyone who deploys their own copy, but it ships disabled, and the demo serves committed
  curated interpretations for the reference repositories instead.

Every commit by a Claude model names it in a Co-Authored-By trailer. No AI receipts are
being submitted beyond this declaration and the git history; Yard #3 lists receipts as
optional.
```

The block matches AI_MODELS.md, which has no open entries left.

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

```
https://youtu.be/dU3AJCfMiNs
```

Uploaded to YouTube as Unlisted on 2026-09-24. It embeds, which Hackyard's player needs.

Done: 77 seconds, 1920 x 1080 at 60 fps, with narration, captions burned in, the city's own
sound and a music bed. Every frame is the live production site, recorded frame by frame on a
real GPU by [scripts/video](../scripts/video), which also narrates and edits it. The finished
file, a caption track, a thumbnail, the YouTube title and description, and a copy-paste
sheet of every form field are packaged outside the repository, in `~/Repo-City-Submission/`.
The MP4 is 208 MB, too large to commit.

Upload it to YouTube, Vimeo or Loom, the sources Hackyard embeds inline. The shot list the
video follows is [DEMO-SCRIPT.md](./DEMO-SCRIPT.md).

---

## What to paste where

Mirrors PLAN.md section 0.13. Work top to bottom.

- [ ] **Confirm the Yard spot is still held.** Section 0.12: check-in closed at kickoff. If it
      was released, rejoin before 2026-09-23 18:00 UTC, which counts as check-in.
- [x] **Repository is public.** `https://github.com/Robertg761/Repo-City`. Check in a logged-out
      browser, not just your own.
- [ ] **Repository URL field** <- section 1.
- [ ] **Writeup field** <- the block in section 3. Confirm the form's own counter agrees with 491
      and does not show it over 500.
- [ ] **AI model declaration field** <- the block in section 4.
- [ ] **Screenshot upload** <- `docs/screenshot.jpg`. Check the preview renders and is not
      cropped into unreadability on the project card.
- [ ] **Demo video URL** <- `https://youtu.be/dU3AJCfMiNs` (section 6). Play it back from the submission
      page to confirm it embeds.
- [ ] **Demo URL field** (if the form has one separate from the repo) <- section 2.
- [ ] **Submit early.** Target 12:30-13:30 Newfoundland time on Friday 25 September. The
      submission can be edited while the Yard is live and locks when voting opens, and the
      earliest submission wins an exact vote tie (sections 0.14, 0.17, 0.18).

### Pre-submission checks that are not form fields

- [x] **Production is on the latest `main`.** The HUD's top-left corner shows the version and
      short SHA. It must be v0.7.1 or later.
- [x] **Walk the live demo once, as a voter would**, in a private window at 1600 x 1000:
      type `honojs/hono`, click a crowd object, switch to night and back, press Tour and let it
      finish, then Analyze another repo with `sindresorhus/p-limit` (village) and
      `facebook/react` (metropolis). Then load `/?tour=1`, survey a repository and check the
      tour starts on its own once the city stands. Repeat the survey and a click on a phone.
      *Done 2026-09-24:* the demo video walks this path on production, and v0.7.1 was checked
      at 1600 x 1000 and 390 x 844.
- [x] `FIXTURE_FALLBACK` is set to `true` in the Vercel project's environment variables.
      **It is opt-in: unset means off.** If it is unset, the fixture fallback that keeps the
      demo alive through a GitHub rate limit during voting is silently disabled. See
      [QA-2026-09-21.md](./QA-2026-09-21.md), bug 1.
- [x] `AI_PROVIDER` is `none` (or unset) in Vercel, so the declaration in section 4 stays true.
- [x] `GITHUB_TOKEN` in Vercel is a fine-grained token with public-repository read only, and
      has not expired. The whole demo dies without it. The settlement-era survey pages through
      up to 1,000 issues and 500 PRs, so it spends more of the token's hourly budget per
      uncached repository than v0.3 did; the 15-minute cache and the fixture fallback absorb
      repeat visits. *Status 2026-09-24:* the token works, because live surveys succeed, and
      Robert confirmed its expiry falls after voting ends.
- [x] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` all pass on `main`.
- [x] Secret scan is clean (`git grep -nIE 'ghp_|github_pat_|sk-ant-'`), `.env.local` is not
      tracked, and no `NEXT_PUBLIC_` variable holds a credential.
- [x] The link preview works. `app/layout.tsx` points `og:image` at
      `https://raw.githubusercontent.com/Robertg761/Repo-City/main/docs/screenshot.png`, which
      shows the new shot only once this work is merged to `main` and pushed. Open that URL
      after pushing and check it is the React metropolis, not the old hono shot.
