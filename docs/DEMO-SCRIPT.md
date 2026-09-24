# Demo video script

Target length **75 seconds**, inside a hard band of 60-90. Built for v0.7.0 and checked on
2026-09-23 against a local build of `main` on a real GPU. Voters judge theme fit, whether it
works and whether it sticks (PLAN.md section 0.16), so the video shows one screen the whole
time, real data on every click, and ends on the tour.

Four repositories, one per settlement tier:

| Tier | Type this | What it looks like (2026-09-23) |
| --- | --- | --- |
| City | `honojs/hono` | "City of hono", 5 districts, 268 open issues and 127 open PRs all drawn, `76 Healthy` |
| Village | `sindresorhus/p-limit` | "Village of p-limit": a chapel on the green, lanes, cottages, ploughed fields, `79 Healthy` |
| Metropolis | `facebook/react` | "Greater react": towers, avenues, motorway ring, "500 of 514 pull requests on the streets", `85 Thriving` |
| Town (spare) | `pmndrs/zustand` | "Town of zustand": a high street, pitched roofs, fields, `96 Thriving` |

The village-to-metropolis cut is the strongest single moment in the video. Do not cut it for
time.

---

## Shot list

### 0:00-0:06 — The landing

Open <https://repo-city-five.vercel.app>. The empty plot and the input pill. Click the box,
type `honojs/hono`, press Enter.

> "This is a GitHub repository."

### 0:06-0:14 — The survey and the reveal

The progress panel ticks through the real steps: files mapped, open issues surveyed, pull
requests surveyed, workflows detected. The city rises district by district, and the crowd of
issues and PRs ripples outward last.

> "Repo City turns it into a city. Folders are districts, files are buildings."

### 0:14-0:28 — Zoom in and click something broken

Scroll in on The Foundry (`/src`) or the ring road around it. Pick an issue object: a fire if
there is one on screen, otherwise a fender-bender (a bug) or a roadblock. Click it. The camera
flies in, a ring marks it, and the inspector opens with the real issue: number, title, age,
comments, labels, and the **"Why this exists"** box.

> "Every open issue is somewhere in the street. A bug is a crash, a blocked issue is a
> roadblock, a security problem is a fire. This one has been open for over a year."

**Before recording, hover a few and pick the one with the best number.** A two-line tooltip
names each object on hover. On 2026-09-23, #4031 "Body is unusable" (a roadblock, 542 days) sat
close to the centre.

### 0:28-0:34 — Pull requests

Press Escape. Swing the camera over a crane or a building wrapped in scaffolding and hover it.

> "Every open pull request is building work: scaffolding on the file it changes, trenches
> for CI work, vans for bots."

### 0:34-0:40 — Night

Click the moon in the time-of-day pill at the bottom. The sky darkens, stars and a moon come
out, windows and street lamps light up.

> "It even has a night shift."

Leave it on night for the next two repositories; it reads better on video.

### 0:40-0:48 — The village

Click **Analyze another repo** at the top. The input opens in place over the same city. Type
`sindresorhus/p-limit`, press Enter.

> "Size comes from the codebase. A small library is a village."

Hold on the green with the chapel for two seconds.

### 0:48-0:58 — The metropolis

Analyze another repo again. Type `facebook/react`.

> "React is a metropolis."

Drag once to orbit so the towers move against each other. Point the cursor at the chip
"500 of 514 pull requests on the streets".

> "Five hundred open pull requests, every one of them on the streets. The rest queue at the
> city limits."

### 0:58-1:15 — The tour, as the closer

Click the orange **Tour** button under "Greater react". The HUD fades, letterbox bars come in,
and the camera flies the city's story with captions: the skyline and health, the busiest
district, the hottest incident, the power grid (CI), the station (releases), the oldest wreck,
and a finale over the whole city. Let it run. Narrate over the first two stops only, then let
the captions carry it.

> "And it can tell you the story itself. One repository. One city. One screen."

The full tour runs 50-72 seconds. For a 75-second video, cut out of it after the third or
fourth stop and end on the finale: press the right arrow (skip) until the last stop, or cut
in the edit.

### Close

The finale shot over the whole city, then a title card:

> **One repository. One city. One screen.**

---

## Alternative cold open: the tour link

If the video starts on the tour instead, load
<https://repo-city-five.vercel.app/?tour=1&time=night>, type `facebook/react` and press Enter.
The tour starts on its own about six seconds after the city stands. Use this for a 30-second
teaser or for the last shot of the main video, recorded separately.

---

## Recording settings

- **Record the production URL**, not `localhost`. `next dev` draws a development badge in the
  corner; production does not. Check the HUD's corner reads `v0.7.0` or later.
- **Browser window 1600 x 1000** (or 1920 x 1080), browser zoom exactly 100%. The HUD is sized
  in `rem`, so 110% zoom makes the panels eat the skyline.
- **Reduced motion off.** With the OS setting "reduce motion" on, the tour cuts between stops
  instead of flying, and flames and beacons stop moving. Turn it off
  for the recording (macOS: Accessibility > Display; Windows: Settings > Accessibility >
  Visual effects > Animation effects on; GNOME: Settings > Accessibility > Reduce animation off).
- **A discrete GPU or a recent laptop, plugged in.** The renderer steps its quality down if
  frames run slow, and a laptop on battery can end up on the low tier. Record plugged in, and
  do one throwaway survey first so the quality probe has settled.
- **Sound is optional.** Turn on the speaker beside the time pill for ambient sound (wind,
  birds, traffic, crickets at night, clanks on building sites); it is off by default and
  starts on the next click. If narration is recorded over the top, leave it off or keep the
  volume low.
- Clean window: no bookmarks bar, no extension icons, no second tab, notifications off. A
  private window gets most of that.
- Keep the cursor visible. The demo is about clicking things.
- Leave the legend open on the first city: a new viewer reads it once and then understands
  the rest of the video. Fold it before the metropolis to give the towers the room.

## Rehearsal notes

- **Get a live survey, not a replay.** A finished survey is cached for 15 minutes per server
  instance, and a cached one fills the progress panel instantly. Rehearse on other
  repositories and record `honojs/hono` cold, or accept the fast fill and shorten that shot.
- **Numbers drift.** Issue numbers, PR counts, health scores and where objects stand all move
  with the repositories. Re-check on the morning of the recording and adjust the narration.
- **Camera.** Drag orbits, right-drag pans, the wheel zooms. Clicking an object flies the
  camera in by itself; let it finish before moving again. Escape or "Return to overview"
  flies back.
- **The tour** ends on Escape, on the X button, or on any drag of the city, so keep hands off
  the mouse while it plays. Space pauses it.
- **Backups:** `vercel/turborepo` (a big city, nine districts) for the first slot, `atom/atom`
  (archived: cold light, idle cranes, no power plant) as an extra beat if there is time, and
  `pmndrs/zustand` if the village or metropolis misbehaves.
- Do a silent run-through first and record narration over it if live narration costs takes.
  The camera work is what has to be clean.
