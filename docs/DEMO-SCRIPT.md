# Demo video script

Target length **60 seconds** (Hackyard's recommended band is 45-70). PLAN.md section 55,
adapted to what the application actually does, verified against the live deployment on
2026-09-21.

Two repositories, chosen because they look nothing like each other:

| | Repository | What the city looks like | Health |
| --- | --- | --- | --- |
| First | `honojs/hono` | Warm daylight, dense pale skyline, green ground, busy traffic, two active cranes, CI power plant running | `76 Healthy`, confidence High |
| Second | `atom/atom` | Cold blue-grey light, grey sky, empty roads, rusted idle cranes, **no** power plant, "Archived repository" label | `44 Mixed` |

The hono-to-atom cut is the strongest single moment in the demo. Do not cut it for time.

---

## Shot list

### 0:00-0:05 — Cold open, empty state

Repo City open on the production URL. The empty plot, the input pill, the legend in the
bottom-left corner. Nothing else on screen.

Type `honojs/hono` into the input. Press Survey.

> "This is a GitHub repository."

### 0:05-0:12 — The survey and the reveal

The progress panel writes one line per real step: repository discovered, architecture mapped,
issues inspected, pull requests reviewed, infrastructure detected, activity measured. Then the
city rises out of the ground, district by district.

> "Repo City turns it into a living 3D city."

### 0:12-0:20 — Orbit

Drag to orbit. Pull down to a low aerial angle so the skyline has depth.

The district signs carry the real directory paths: **The Foundry `/src`**, **Proving Grounds
`/runtime-tests`**, **Speed Trials `/benchmarks`**, **Knowledge District `/docs`**,
**Instrument Yard `/perf-measures`**. Building height follows how central a file is.

> "Directories become districts. Files become buildings. Nothing here is decoration -
> everything you can see came out of the GitHub API."

### 0:20-0:29 — The incident

Scars sit in the streets on the ring roads around The Foundry: a crater in the road with
barriers thrown across it. Fly in on one and click it.

The inspector opens over the city with the real issue. On 2026-09-21 the top-ranked one was
**#2723, "hono/aws-lambda + @hono/graphql-server GET not working!"**, labelled `bug`, open
855 days, 15 comments.

> "That wreck in the road is a real unresolved bug - open for over two years."

**Before recording, hover the incidents and pick whichever one has the best number.** hono had
74 open issues on 2026-09-21 and the ranking moves; read the tooltip, then click. The "Why this
exists" box in the inspector states the rule in plain words, and it is worth a beat on screen.

### 0:29-0:36 — The crane

Press Escape or click Return to overview, then move to a crane. hono had two active ones on
2026-09-21, over Knowledge District and Instrument Yard. Click it.

> "Pull requests become construction sites. Merged ones become finished buildings; stalled ones
> get a crane that has not moved in months."

### 0:36-0:42 — The power plant

Pan to the far edge of The Foundry, where the plant with the red-and-white stacks stands.

> "Continuous integration is the power station. Tests are the fire station. Documentation is
> the information centre."

### 0:42-0:48 — Health

Cut attention to the card in the top-right: **76 Healthy, Confidence: High**. Click
"How is this scored? +" to open the breakdown.

> "Maintenance, reliability, documentation, organization and responsiveness shape the world -
> and the city tells you how confident it is."

The breakdown panel ends with "This is a visualization, not a software audit." Let it be
readable for a moment. It is an honest line and it pre-empts the obvious objection.

### 0:48-0:55 — The second repository

Click **Analyze another repo** at the top. The input expands in place, over the same city.
Type `atom/atom`.

> "Now a different repository - without leaving the screen."

### 0:55-1:02 — The archived city

The world rebuilds cold. Grey sky, blue-grey buildings, empty roads, rusted cranes standing
still, no power plant at all, `ARCHIVED REPOSITORY` under the repo name, health down to
**44 Mixed**.

> "This one was archived three years ago. The lights are off, the cranes stopped, and there is
> no power plant, because there is no CI."

### 1:02-1:05 — Close

Orbit once into a final aerial of the archived city, then hold. Title card:

> **One repository. One city. One screen.**

---

## Recording settings

- **Record the production URL**, <https://repo-city-five.vercel.app>, not `localhost`.
  `next dev` draws a development indicator badge in the corner; production does not.
- **Browser window 1600 x 1000**, browser zoom exactly 100%. The HUD is sized in `rem`, so a
  zoom of 110% makes the panels eat the skyline.
- Use a clean window: no bookmarks bar, no extension icons, no second tab, notifications off.
  A private window is the easiest way to get all of that at once.
- Keep the cursor visible. The demo is about clicking things.
- Leave the legend expanded. A first-time voter reads it once and then understands every
  object in the rest of the video.
- Leave the inspector closed except in the two shots that open it.

## Rehearsal notes

- **Get a live survey, not a replay.** A completed analysis is cached for 15 minutes per
  server instance. Inside that window the progress panel fills instantly instead of stepping
  through the survey, which flattens the 0:05 beat. Either rehearse on other repositories and
  record `honojs/hono` cold, or accept the fast fill and shorten that shot.
- **Numbers drift.** Issue numbers, PR titles, the health score and the crane positions all
  move with the repository. Re-check the two repos the morning of the recording and adjust the
  narration; do not read these numbers off this file on the day.
- **Camera.** Drag up lowers the camera towards the skyline; drag down flattens it towards
  top-down. Scroll wheel zooms. Clicking an object flies the camera in on its own, so let the
  transition finish before moving again.
- **Backup repositories** if either demo repo misbehaves on the day: `vercel/turborepo` (nine
  districts, the biggest skyline) or `microsoft/vscode` (`85 Thriving`, incidents everywhere,
  including a bug open 3,083 days) for the first slot; `facebookarchive/flux` for the archived
  slot.
- Do a silent run-through first and record narration over it if live narration costs takes.
  The camera work is what has to be clean.
