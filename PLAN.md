# Repo City

## Hackyard Yard #3 Build Specification

---

# 0. HACKYARD COMPLIANCE REQUIREMENTS

These requirements override every other part of this plan.

If any feature, implementation decision, or later instruction conflicts with this section, follow this section.

## 0.1 Official Yard #3 theme

**Theme: One Screen**

Hackyard does not currently publish a more specific technical definition for the phrase "One Screen."

The official rule is that the theme is a real constraint, not merely a suggestion. Theme fit is not automatically enforced by Hackyard software. Instead, voters are explicitly encouraged to consider whether a project fits the theme.

Therefore, statements such as:

* camera movement is officially allowed
* modals are officially allowed
* scrolling is officially allowed
* overlays are officially allowed
* changing scenes is officially forbidden
* URL routes are explicitly forbidden

are **not official Hackyard rules unless Hackyard subsequently publishes such clarification**.

They are design interpretations.

---

# 0.2 Repo City's internal One Screen rule

To stay comfortably within the theme, Repo City will adopt a stricter internal rule:

> **The application consists of one persistent 3D city viewport. The user may move anywhere within that world, but the application never navigates to another application screen or replaces the city with another scene.**

Allowed within Repo City:

* orbiting the camera
* zooming
* panning
* changing viewing angle
* focusing the camera on an object
* flying closer to an object
* selecting buildings
* selecting incidents
* hovering objects
* displaying tooltips
* displaying HUD information
* displaying floating inspectors
* displaying overlays
* expanding/collapsing HUD sections
* entering another repository into the same interface
* regenerating the city inside the same world

Avoid:

* `/issues`
* `/settings`
* `/repo`
* `/analysis`
* `/building/123`
* full-screen replacement views
* separate 3D scenes representing different pages
* entering a building and loading a completely separate interior experience
* wizard-style sequences
* traditional multi-page navigation

The guiding rule is:

> **You can go anywhere, but you never leave the city screen.**

This is our conservative interpretation of the theme, not wording from Hackyard.

---

# 0.3 Official build window

Yard #3:

**Kickoff:** September 21, 2026 at 18:00 UTC
**Submission deadline:** September 25, 2026 at 18:00 UTC

In Newfoundland:

**Kickoff:** Monday, September 21 at 3:30 PM NDT
**Deadline:** Friday, September 25 at 3:30 PM NDT

Hackyard's standard schedule is Monday through Friday for building, followed by community voting through Sunday.

Project-specific code must be produced during this build window.

**Practical note:** kickoff is mid-afternoon Monday in Newfoundland, so Monday is a half day. Effective build time is roughly four days, not five. The daily goals in sections 50 to 54 are milestones, not a strict serial schedule; see section 72 for how the work is parallelized across agents.

**Timing log:** GitHub repository `Robertg761/Repo-City` created 2026-09-21 18:21 UTC. Local repository initialized 2026-09-21 18:24 UTC. First commit (planning documents) 2026-09-21 19:41 UTC. Repository made public 2026-09-21 19:41 UTC. All after kickoff.

---

# 0.4 Solo development only

Yard #3 is a **solo build**.

No development team.

The project should be represented as Robert's individual entry.

AI coding agents and AI models are permitted because Yard #3 is an open-model Yard. They do not count as human teammates.

---

# 0.5 AI models

Yard #3 is open-model.

Allowed:

* GPT
* Claude
* Gemini
* Grok
* local models
* coding agents
* combinations of models
* no AI at all

The submission must include a **model declaration** describing what was used.

Maintain the running list in **`AI_MODELS.md`** at the repository root. Every agent that writes code must append itself there if it is not already listed. The README's "AI usage" section is generated from that file on Friday.

Known so far:

```text
AI used during development:
- Claude Fable 5.1 (planning audit, orchestration, code review)
- Claude Opus 5 (implementation sub-agents)
- Claude Opus 5 via the Anthropic API at runtime (architecture interpretation feature)
- [Robert to confirm] model used to draft the original plan before kickoff
```

Do not rely on memory Friday afternoon.

---

# 0.6 Optional AI receipts

Hackyard allows optional AI "receipts."

These can include things such as:

* shared AI chat
* session log
* AI console usage page
* session log committed to the repository

They are optional and Hackyard explicitly says skipping them is not held against builders.

Do not spend meaningful build time creating receipts.

---

# 0.7 Code timing

Planning before kickoff is allowed.

Hackyard explicitly distinguishes:

**Ideas are free. Code is timed.**

Allowed:

* planning
* sketches
* architectural decisions
* feature planning
* discussing the concept
* choosing technologies

Project-specific implementation must happen during the Yard build period.

---

# 0.8 Existing code restriction

Allowed:

* libraries
* dependencies
* frameworks
* CLI scaffolding
* `create-next-app`
* public boilerplates
* public starter templates

Not allowed:

* starting Repo City from Robert's own previously written project-specific code
* copying significant custom code from an older Robert project to gain a head start

Hackyard specifically permits frameworks, dependencies and public scaffolding while prohibiting the builder's own pre-written project code.

Therefore:

**Do not copy functionality out of LinkDish, HA Desktop Widget, Commit Archive, or another personal project into Repo City.**

Using a normal npm package that those projects also happen to use is fine.

---

# 0.9 Repository requirement

The submitted repository must be **public/open-source**.

Recommended:

* create a fresh GitHub repository for Repo City
* keep it public
* create it during the Yard build window

A repository created before kickoff does not automatically disqualify an entry, but Hackyard publicly displays repo timing information.

A fresh post-kickoff repo avoids unnecessary ambiguity.

**Status:** `https://github.com/Robertg761/Repo-City` was created after kickoff and switched to public on 2026-09-21 with:

```bash
gh repo edit Robertg761/Repo-City --visibility public --accept-visibility-change-consequences
```

---

# 0.10 Public timing information

Hackyard displays repository timing information on submissions, including:

* repository creation date
* commit count
* first commit timing
* last commit timing
* comparison with the official build window

Hackyard describes this information as context rather than absolute proof.

Therefore:

* commit normally
* do not rewrite history unnecessarily
* do not alter commit dates
* make normal incremental commits
* make the repo history accurately represent development

---

# 0.11 Spot requirement

A builder must hold a Yard spot to submit.

Hackyard enforces this at the database level.

Robert already claimed a Yard #3 spot.

Do not release it.

---

# 0.12 Check-in rule

Hackyard requires builders holding spots before kickoff to check in.

Check-in opens 48 hours before kickoff and closes at kickoff.

If a builder fails to check in, the spot automatically releases to the waitlist.

For anyone joining a Yard after kickoff, joining during the first 48 hours counts as check-in.

**Action for Robert (time-sensitive):** confirm on the Hackyard site that the Yard #3 check-in was completed and the spot still shows as held. Check-in closed at kickoff. If the spot was released, rejoin within the first 48 hours (before September 23 at 18:00 UTC), which counts as check-in.

---

# 0.13 Required submission material

Hackyard requires:

1. **Public repository URL**
2. **Writeup, maximum 500 characters**
3. **AI model declaration**

Hackyard lists the following as optional:

4. Demo video
5. Screenshot

The demo video is described as strongly recommended. Supported inline sources currently include:

* YouTube
* Vimeo
* Loom

The screenshot is particularly valuable because Hackyard uses it as the visual users first see on the project card.

For Repo City, treat both optional items as effectively required for our own submission quality.

---

# 0.14 Submission editing

The submission can be edited while the Yard remains live.

Once voting/judging begins, submissions lock.

Therefore:

Submit a valid version before the final deadline rather than waiting until the last minute.

Then improve the submission while editing remains available.

---

# 0.15 Voting rules

Voting is performed by the Hackyard community.

Official rules:

* every signed-in Hackyard user may vote
* spectators may vote
* one vote per person per Yard
* the vote is final after being cast
* builders cannot vote for themselves
* vote totals stay hidden until voting ends
* individual voters are not publicly identified
* Hackyard does not use a judging panel or organizer override

---

# 0.16 What voters are encouraged to consider

Hackyard specifically identifies:

* whether the project fits the theme
* whether it actually works
* whether something real was shipped during the build period

Hackyard also explicitly notes that a demo video demonstrates functionality better than description alone.

That means Repo City should optimize for:

**obvious theme fit + immediately demonstrable functionality + memorable presentation**

rather than maximum feature count.

---

# 0.17 Submission ordering

Projects are not permanently shown in submission order.

Hackyard continuously reshuffles project order during the Yard and voting period to reduce placement advantage.

Therefore there is no reason to rush submission merely to appear first in the project list.

---

# 0.18 Tie rule

Winner:

**Most votes.**

If projects receive the same number of votes:

**earliest submission wins the tie.**

Therefore:

Do not sacrifice quality just to submit extremely early.

But once the build is genuinely ready, there is also no benefit to waiting unnecessarily.

---

# 0.19 Public nature of submission

Hackyard submissions are public.

The submission page can expose:

* screenshot
* demo
* writeup
* public repository
* model declaration

Therefore:

Never commit:

* GitHub tokens
* AI API keys
* secrets
* private environment variables
* credentials
* personal/private repository data

Use environment variables for all secrets.

---

# 0.20 Hackyard compliance checklist

Before submission, all boxes must be true:

* [ ] Project matches "One Screen"
* [ ] One persistent 3D city viewport
* [ ] No traditional multi-page app
* [ ] Solo development
* [ ] Project-specific code written within official build window
* [ ] No personal pre-existing project code reused
* [ ] Public GitHub repository
* [ ] No committed secrets
* [ ] Valid Yard #3 spot
* [ ] Repo URL ready
* [ ] Writeup is 500 characters or fewer
* [ ] Model declaration accurate
* [ ] Demo recorded
* [ ] Screenshot captured
* [ ] Hosted application tested
* [ ] Submission completed before September 25 at 18:00 UTC
* [ ] Final submission checked before voting locks edits

---

# 1. Core concept

**Repo City turns a GitHub repository into an explorable 3D city.**

A user pastes a public GitHub repository URL.

The application analyzes observable signals from that repository and generates a city whose physical condition reflects the state of the project.

A healthy, maintained, well-documented repository becomes a lively, organized, attractive city.

A struggling repository develops visible problems.

An archived or badly neglected repository can become a quiet, deteriorated city.

The important twist is that the visualization is not decorative.

**Almost everything visible in the city corresponds to something real in the repository.**

Examples:

* car accident = bug/issue
* construction crane = pull request
* abandoned construction = stale PR
* power station = CI
* damaged power infrastructure = failing workflows
* fire station = testing infrastructure
* information center = documentation
* districts = codebase areas
* buildings = files/modules
* activity = recent development
* city population = project/community activity

The experience should create one specific realization:

> "Wait. That car crash is actually issue #142?"

That is the heart of Repo City.

---

# 2. Product thesis

Normal repository-analysis tools turn software into:

* tables
* charts
* badges
* percentages
* graphs

Repo City turns a repository into a **place**.

Problems become physical.

Activity becomes movement.

Architecture becomes geography.

Maintenance becomes city condition.

The user understands the repository by exploring it spatially.

---

# 3. First 30 seconds

The opening experience matters more than almost any secondary feature.

The user opens Repo City.

One 3D environment is visible.

Initially it is mostly empty terrain.

A small floating input says:

**Enter a GitHub repository**

Example:

`github.com/facebook/react`

User pastes URL.

Status:

**Surveying repository...**

Progress appears:

```text
✓ Repository discovered
✓ Architecture mapped
✓ Issues inspected
✓ Infrastructure detected
◌ Planning districts
◌ Constructing city
```

The city begins appearing inside the same viewport.

Roads.

Districts.

Buildings.

Infrastructure.

Trees.

Traffic.

Incidents.

Construction.

The camera finishes in a beautiful aerial position.

HUD:

```text
facebook/react

CITY HEALTH
87

Active development
Strong infrastructure
Large project
```

The user sees smoke or an accident.

They click it.

Camera moves down.

Inspector appears.

```text
INCIDENT

Issue #xxxxx

Hydration mismatch after ...
Open 31 days
27 comments

Represented as a traffic incident because
this is an unresolved bug with significant activity.
```

That is the first "aha."

---

# 4. Art direction

Use:

**Stylized low-poly miniature city**

Avoid:

* photorealism
* detailed architectural models
* realistic physics
* giant downloaded asset packs
* AAA expectations

Desired appearance:

* clean geometry
* attractive lighting
* small diorama feeling
* coherent city palette
* readable buildings
* soft shadows
* miniature cars
* tiny animated details
* moderate visual exaggeration

The default camera should resemble an isometric game while remaining true perspective 3D.

---

# 5. Camera

Use a perspective camera.

Default:

* elevated
* roughly 45 to 55 degree downward angle
* enough distance to see most of city
* subtle perspective

Controls:

Desktop:

* drag = orbit
* secondary drag = pan
* wheel = zoom
* click = select

Touch:

* drag = orbit
* pinch = zoom
* two-finger drag = pan
* tap = select

How it should feel: like a map viewer or a city-builder.

* Pan slides the ground under the pointer. It moves the orbit target across the ground, never up into the sky or down under it, so an orbit after a pan still pivots on the city.
* The wheel zooms towards whatever is under the cursor, not the middle of the screen.
* A press that moves more than a few pixels before release is a drag, not a click: 5 CSS pixels for a mouse, 10 for a finger or pen. Letting go of an orbit or a pan never selects, clears or flies anywhere.
* Only a selection, a return to overview or a new city moves the camera by itself. A window resize refits the overview only if the user has not moved the camera since it was framed.

Camera limits:

* prevent going underneath terrain
* prevent extreme upside-down camera
* prevent zooming so far away city disappears
* prevent clipping deeply through buildings

Implementation decision: use drei's `<CameraControls>` (wraps the `camera-controls` library) rather than `OrbitControls`. It provides `setLookAt(...)` with smooth transitions for object focus and return-to-overview, plus `minDistance`, `maxDistance`, `maxPolarAngle`, and a boundary box for the limits above. Touch gestures are handled by the same component. Do not hand-roll camera tweening.

---

# 6. Object focus

Clicking something meaningful should:

1. identify the selected object
2. smoothly rotate/translate camera toward it
3. stop at a useful inspection distance
4. highlight it
5. open inspector overlay

The fly-to keeps the compass direction the user is already looking from, and roughly their tilt, and only moves in. It never swings the city round to a fixed corner. The tilt is kept inside a band so the object stays in view: 49 to 69 degrees from overhead for buildings, landmarks and districts, and 26 to 41 degrees, a steeper look down between the blocks, for incidents and construction sites. After a long orbit it takes the short way round. Orbiting after a focus pivots on the object.

Do not load a new scene.

Do not replace the city.

Closing the inspector leaves the city intact.

Include:

**Return to overview**

This smoothly restores the default city composition.

---

# 7. Repository = city

The entire GitHub repository maps to one city.

Important distinction:

**size is not quality**

A huge popular repository may produce a massive metropolis with problems.

A tiny excellent repository may produce a beautiful little town.

Keep these dimensions separate:

* scale
* health
* activity
* complexity
* popularity

---

# 8. Districts

Important repository areas become districts.

Potential input:

```text
src/
packages/
docs/
tests/
examples/
scripts/
```

Potential output:

```text
Core District
Packages District
Knowledge District
Safety District
Demo District
Operations District
```

AI can improve district naming after examining architecture.

Every generated district must retain its source path.

Example:

```text
Core District
Source: /src
```

District selection rules:

* between 3 and 8 districts; a repository with a single top-level source directory may promote its children to districts
* rank top-level directories by descendant file count and weight; take the top N
* everything not covered by a chosen district collapses into one **Outskirts** district with source path `/`
* root-level files (README, manifests, config) live in the civic center, not a district
* `node_modules`, `vendor`, `.git`, build output, lockfiles, and binary assets are excluded before ranking
* AI may rename districts and add a purpose sentence; it may not add, remove, or re-path them

---

# 9. Buildings

Buildings represent selected files, modules or packages.

Do not render every file.

Suggested range:

**75 to 300 meaningful buildings**

Possible encodings:

### Height

Relative importance or file/module size.

### Footprint

Complexity or descendant count.

### Location

Directory/module.

### Style variation

Programming language or functional category.

### Condition

Maintenance or architectural warnings.

Avoid turning languages into completely different art styles.

The city needs visual unity.

Building selection algorithm (deterministic, in `lib/analysis/fileSelection.ts`):

1. Prune the tree (exclusions above; depth greater than 6 collapsed into parent).
2. Choose a granularity level so the building count lands in range: try files; if more than 300 candidates, aggregate to directories at depth 3, then depth 2, until the count is 300 or fewer. A building is therefore a file in small repos and a folder in large ones. The inspector must say which it is.
3. Score each candidate: `log2(size + 1)` plus bonuses for entry points (`index.*`, `main.*`, `mod.rs`, `__init__.py`), manifests, and paths mentioned in the README, minus a penalty for test and fixture paths.
4. Keep the top 300 by score, but guarantee at least 4 buildings per district when the district has that many candidates, so no district renders empty.
5. Height maps to score rank (log scale, clamped to 5 visual tiers). Footprint maps to descendant count for folders and to a fixed small footprint for files.

---

# 10. Important files

Certain files deserve landmarks or special treatment.

Examples:

```text
README.md
package.json
Cargo.toml
pyproject.toml
Dockerfile
CONTRIBUTING.md
CHANGELOG.md
```

They can become recognizable civic structures rather than ordinary buildings.

---

# 11. Issues

Issues are among the strongest visual metaphors.

## Generic open issue

Possible representation:

* pothole
* broken traffic signal
* road crew
* small obstruction

## Bug

Possible representation:

* collision
* damaged infrastructure
* emergency response

## Stale bug

Possible representation:

* abandoned wreck
* barricades
* weathered warning signs
* weeds

## Severe/highly active bug

Possible representation:

* large crash
* major closure
* fire
* significant infrastructure failure

Do not create one accident per issue.

Cap visually represented issues.

Recommended:

**6 to 12 visible incidents**

Rank candidate issues based on:

* bug labels
* priority/severity labels
* age
* activity
* number of comments
* current status

Concrete ranking (deterministic, in `lib/analysis/metrics.ts`):

```text
isBug      = label matches /bug|defect|regression|crash/i
isSevere   = label matches /critical|p0|p1|high|urgent|security|blocker/i
score      = 3*isBug + 2*isSevere + log2(comments + 1) + min(ageDays, 365)/120
visualState:
  isBug && isSevere && comments >= 10 -> "major"      (fire or large crash)
  isBug && ageDays > 180               -> "stale"      (wreck, barricades, weeds)
  isBug                                -> "collision"  (accident, emergency response)
  otherwise                            -> "minor"      (pothole, road crew)
```

Take the top 12 by score. If the repository has fewer than 6 open issues, show all of them. Placement: if an issue title or body mentions a path that falls inside a district, place the incident on a road adjacent to that district; otherwise place it on a seeded road position. The inspector's "why this exists" sentence is generated from the matched rule, never free-form.

---

# 12. Issue inspector

Example:

```text
INCIDENT

🐛 Issue #381
Authentication occasionally fails after refresh

OPEN
43 days
12 comments

Labels:
bug
priority-high

WHY THIS EXISTS

This incident represents an unresolved bug with
high discussion activity.

View on GitHub
```

The "WHY THIS EXISTS" section is essential.

It teaches the visual language.

---

# 13. Pull requests

Pull requests become construction.

## Open PR

Active construction site.

Elements:

* crane
* fenced area
* construction equipment
* partially completed building

## Fresh merged PR

Newly completed building.

## Stale open PR

Abandoned construction.

Elements:

* unfinished structure
* stopped crane
* empty site
* weathered materials

Cap construction sites.

Recommended:

**maximum 8 prominent PR sites**

State rules:

```text
open, updated within 14 days           -> "active"    (crane moving, equipment)
open, not updated for 60+ days         -> "abandoned" (stopped crane, weathered)
open, otherwise                        -> "slow"      (crane idle)
merged within the last 14 days         -> "completed" (fresh building, clean paint)
```

Fetch merged PRs separately with `state=closed&sort=updated`; the merged ones have `merged_at` set. Rank open PRs by recency of update and comment count; take up to 6 open plus up to 2 recently merged.

---

# 14. CI

CI represents the city's power infrastructure.

Landmark:

**power station / electrical substation**

### Healthy

* operational
* city lights
* clean infrastructure
* occasional subtle electrical effect

### Recent failure

* warning light
* small sparks
* smoke
* localized visual warning

### Consistent failures

* visibly struggling plant
* partial outages

### No GitHub CI detected

Do not imply failure.

Simply omit or simplify advanced power infrastructure.

State derivation, based on the last 50 workflow runs on the default branch:

```text
no workflows                                   -> "none"
workflows but zero completed runs              -> "unknown"  (render plant, no status effects)
latest run per workflow all succeeded          -> "healthy"
some latest runs failed, failure rate < 40%    -> "recent-failure"
failure rate >= 40% over the window            -> "failing"
```

Runs with conclusion `skipped` or `cancelled` are ignored. Also detect non-Actions CI config files (`.circleci/`, `.travis.yml`, `Jenkinsfile`, `.gitlab-ci.yml`, `azure-pipelines.yml`) and report `provider: "other"` with state `unknown`.

---

# 15. Tests

Tests become emergency/safety infrastructure.

Preferred metaphor:

**fire station**

Strong visible testing infrastructure:

* larger station
* active emergency vehicles
* well-maintained

Little detected testing infrastructure:

* small station or absent

Important distinction:

Do not claim **test coverage** unless actual coverage information is available.

Detect:

* test directories
* test scripts
* test dependencies
* testing config
* workflow test jobs

Call this:

**Test Infrastructure**

not:

**Test Coverage**

---

# 16. Documentation

Documentation becomes city wayfinding.

Potential representations:

* visitor center
* library
* road signs
* maps
* information boards

Signals:

* README
* `/docs`
* CONTRIBUTING
* examples
* API docs
* changelog

Strong docs make the city feel navigable.

Weak docs produce sparse guidance.

---

# 17. Contributors

Contributors create city life.

Do not map one contributor to one pedestrian.

Use aggregated activity to control:

* pedestrians
* cars
* lit buildings
* construction activity
* street movement

A solo repo can still be excellent.

A one-person project should become a small lively town, not a failed city.

---

# 18. Commits

Recent commits influence activity.

Possible effects:

* traffic density
* construction vehicles
* moving people
* active machinery
* lit windows

Low recent commit activity should not automatically produce decay.

A stable mature project might simply be quiet.

Decay requires stronger signals.

---

# 19. Archived repositories

GitHub's archived status is a clear factual signal.

Archived repos can receive a deliberate abandoned treatment:

* quiet roads
* reduced traffic
* vegetation
* faded signage
* dimmer lighting
* abandoned construction
* boarded structures

HUD should say:

**Archived repository**

not:

**Bad repository**

---

# 20. Releases

Releases can become transportation infrastructure.

Potential metaphor:

**rail station or harbor**

Active releases:

* busy station
* freight movement
* arriving vehicles

Occasional releases:

* moderate activity

No GitHub Releases:

* no major shipping terminal

Do not heavily penalize repositories that do not use GitHub Releases.

---

# 21. Stars

Stars indicate attention/popularity, not code quality.

Use them for:

* city prominence
* visitor traffic
* skyline scale
* decorative prestige

Do **not** substantially increase health because of stars.

---

# 22. Forks

Forks can represent external connections.

Examples:

* highways leaving city
* rail connections
* small satellite links

Again:

fork count is popularity/ecosystem information, not quality.

---

# 23. City Health

Optional public score:

```text
CITY HEALTH
82
```

It must be explained as a visualization based on observable repository signals.

Suggested weights:

### Maintenance - 30%

* recent development
* issue staleness
* PR staleness
* release activity where meaningful

### Reliability infrastructure - 25%

* CI configuration
* recent workflow status
* testing infrastructure
* linting/type checks/build configuration

### Documentation - 20%

* README
* docs
* contribution guide
* examples
* changelog

### Organization - 15%

* deterministic structure metrics
* constrained AI architecture interpretation

### Responsiveness - 10%

* issue interaction
* PR activity
* contributor activity

Concrete sub-scores (each 0 to 1, in `lib/analysis/scoring.ts`, all inputs from deterministic metrics):

```text
maintenance    = 0.4*recency + 0.3*(1 - staleIssueShare) + 0.3*(1 - stalePrShare)
                 recency: pushed within 30d = 1, 90d = 0.7, 365d = 0.4, older = 0.15
                 staleIssueShare: open issues untouched 180d+ / open issues (0 if none)
                 stalePrShare: open PRs untouched 60d+ / open PRs (0 if none)
reliability    = 0.4*ci + 0.35*tests + 0.25*tooling
                 ci: healthy 1, recent-failure 0.6, unknown/other 0.5, failing 0.2, none 0.3
                 tests: strength tier 0..3 mapped to 0, 0.4, 0.75, 1
                 tooling: lint/format/typecheck/build config present, 0.25 each, max 1
documentation  = readme(0.35, scaled by length up to 2000 chars) + docsDir(0.2)
                 + contributing(0.15) + examples(0.15) + changelog(0.15)
organization   = 0.6*structure + 0.4*aiOrganization
                 structure: 1 - clamp((rootFileCount - 12)/40) averaged with
                            a top-level directory balance term
                 aiOrganization: the AI's 0..1 "organizationClarity" field;
                            when AI is unavailable use structure alone
responsiveness = 0.5*issueTouchRate + 0.5*contributorBreadth
                 issueTouchRate: share of open issues updated in the last 90d
                 contributorBreadth: min(activeContributors90d, 5)/5

health = round(100 * (0.30*maintenance + 0.25*reliability + 0.20*documentation
                      + 0.15*organization + 0.10*responsiveness))
```

Archived repositories skip maintenance and responsiveness decay language in the HUD but still compute the number. Stars and forks never enter this formula.

---

# 24. Health descriptions

Possible visualization states:

```text
0-20   Critical
21-40  Struggling
41-60  Mixed
61-80  Healthy
81-100 Thriving
```

These must be clearly understood as Repo City's generated visualization.

They are not authoritative software audits.

---

# 25. Confidence

Add:

**Analysis confidence**

Example:

```text
City Health: 78
Confidence: High
```

Confidence considers:

* amount of available repository data
* number of files
* commit history
* issues
* pull requests
* workflows
* readable manifests/configs

Do not present a tiny repository with almost no signals as a highly certain judgment.

Confidence rule: count available signals out of seven (tree with 20+ files, 20+ commits, any issues, any PRs, any workflows, README present, a manifest parsed). 6 or 7 is High, 4 or 5 is Medium, otherwise Low. A truncated tree or a GitHub partial failure caps confidence at Medium and adds a reason string shown in the HUD tooltip.

---

# 26. AI role

AI should **not** independently decide whether a repository is good or bad.

Split responsibilities.

## Deterministic analysis

Determines factual signals.

Examples:

* issue count
* PR age
* workflow results
* commit recency
* archived status
* documentation presence
* test configuration

## AI

Interprets:

* architecture
* important areas
* district names
* likely module purpose
* concise explanations
* notable strengths
* notable concerns

## Procedural city generator

Transforms structured interpretation into 3D world.

Pipeline:

```text
GitHub
   ↓
Repository Snapshot
   ↓
Deterministic Metrics
   ↓
AI Architecture Interpretation
   ↓
City Model
   ↓
3D Renderer
```

---

# 27. AI failure handling

The city must still work if AI fails.

Fallback:

* directories become districts by literal name
* deterministic metrics calculate health
* buildings derive from file tree
* issues still generate incidents
* PRs still generate construction
* CI still generates infrastructure

AI enhances the experience.

AI does not own the critical path.

---

# 28. AI grounding

Never give AI permission to invent repository facts.

Provide evidence such as:

* metadata
* directory tree
* README
* manifests
* configuration files
* workflow files
* issue summary
* pull request summary
* commit summary
* selected source files

Require structured output.

Example:

```json
{
  "summary": "...",
  "districts": [],
  "importantModules": [],
  "strengths": [],
  "concerns": []
}
```

Each significant interpretation should reference supporting files/paths where practical.

Implementation decisions (revised 2026-09-21: Robert will not fund runtime API tokens):

* **The runtime AI call is optional and ships disabled.** The deployed demo runs with `AI_PROVIDER=none`. The deterministic path is the product; the AI layer is a plug-in for anyone who deploys their own copy with a key.
* Provider-agnostic adapter in `lib/ai/` using the Vercel AI SDK (`ai` package, `generateObject` with the Zod schema from `lib/ai/schema.ts`). Providers wired: `anthropic` (`@ai-sdk/anthropic`), `openai` (`@ai-sdk/openai`), `google` (`@ai-sdk/google`), and `openai-compatible` (`@ai-sdk/openai-compatible`, for local models such as Ollama or LM Studio). Env: `AI_PROVIDER` (default `none`), `AI_MODEL`, `AI_API_KEY`, `AI_BASE_URL` (openai-compatible only). Do not install `@anthropic-ai/sdk` directly.
* Input budget: at most roughly 25k tokens. Send the pruned tree as an indented path list (depth 3, max 600 lines), README up to 6k characters, up to 3 manifests up to 2k characters each, workflow file names and job names only, plus the deterministic metrics summary. Never send issue bodies or source files in the MVP.
* Timeout: 25 seconds. On timeout, error, or schema failure, `aiStatus` becomes `failed` and the deterministic path continues. When `AI_PROVIDER=none`, `aiStatus` is `skipped`. Set `export const maxDuration = 60` on the route handler.
* The schema includes an `organizationClarity` number from 0 to 1 and, per district and module, an `evidence` array of paths. Any evidence path not present in the tree is dropped before use.
* **Curated interpretations for the reference repositories.** For the repos in section 59, the build agents read the real repository and write `fixtures/interpretations/<owner>__<repo>.json` conforming to `AiInterpretation` with `model` set to the agent's model name. When `AI_PROVIDER=none` and a curated file exists for the analyzed repo, the server merges it with `aiStatus: "ok"` and the inspector labels it "curated interpretation". This is development-time AI use and is declared in `AI_MODELS.md`. Every evidence path in a curated file is validated against the live tree at request time, same as a model response, so a stale interpretation degrades instead of lying.
* Testing W4 without a key: `openai-compatible` against a local Ollama instance if one is available; otherwise unit tests mock the provider and assert schema validation, timeout, and fallback behaviour.

---

# 29. GitHub ingestion

MVP supports:

**public repositories only**

Input examples:

```text
https://github.com/facebook/react
```

Normalize:

```text
facebook/react
```

Fetch:

1. repository metadata
2. default branch
3. repository tree
4. recent commits
5. issues
6. pull requests
7. contributors
8. Actions workflows
9. recent workflow runs
10. releases
11. selected file contents

Do not clone and analyze every source file during MVP.

Endpoint plan (REST v3, all requests fired in parallel after the first one, roughly 15 requests uncached):

```text
 1. GET /repos/{o}/{r}                                    metadata, default_branch, archived, counts
 2. GET /repos/{o}/{r}/git/trees/{default_branch}?recursive=1
 3. GET /repos/{o}/{r}/commits?per_page=100               head SHA is commits[0].sha
 4. GET /repos/{o}/{r}/issues?state=open&sort=comments&direction=desc&per_page=100
 5. GET /repos/{o}/{r}/pulls?state=open&sort=updated&direction=desc&per_page=50
 6. GET /repos/{o}/{r}/pulls?state=closed&sort=updated&direction=desc&per_page=30
 7. GET /repos/{o}/{r}/contributors?per_page=100
 8. GET /repos/{o}/{r}/actions/workflows
 9. GET /repos/{o}/{r}/actions/runs?per_page=50&branch={default_branch}
10. GET /repos/{o}/{r}/releases?per_page=20
11. GET /repos/{o}/{r}/readme
12-14. GET /repos/{o}/{r}/contents/{manifest}             up to three manifests found in the tree
```

Known gotchas that must be handled:

* Renamed or transferred repositories return a 301 to `/repositories/{id}` (verified: `facebook/react` now redirects to `react/react`). Follow the redirect, then use the `full_name` from the response as the canonical name for caching, the seed, the HUD, and all follow-up requests. Never build later URLs from the user's typed input.
* The issues endpoint returns pull requests too. Drop every item with a `pull_request` key.
* The tree endpoint sets `truncated: true` above 100,000 entries or 7 MB. Continue with what was returned, lower confidence, and add a warning.
* Contributors and Actions endpoints can return 204 or 202 with no body on very new or very large repositories. Treat as empty.
* Each request that fails should degrade that one signal, not the whole analysis. Only request 1 and request 2 are fatal.
* Send `Accept: application/vnd.github+json` and `X-GitHub-Api-Version: 2022-11-28`. Read `x-ratelimit-remaining` and surface a friendly error when it hits zero.
* The token should be a fine-grained personal access token with public repository read access and no other permissions.

---

# 30. Request budget

Avoid making hundreds of GitHub API requests.

Target roughly:

**10 to 20 requests per uncached analysis**

Use bulk/tree endpoints wherever possible.

Cache repository analysis temporarily.

Caching and abuse controls (the hosted app runs on Robert's tokens and is used by voters):

* Server-side in-memory cache of the completed `RepoAnalysis` keyed by `owner/repo`, 15 minute TTL, in `lib/cache.ts`. Serverless instances do not share memory, so additionally pass `next: { revalidate: 600 }` on every GitHub `fetch` so the platform data cache dedupes repeated repos across instances.
* Per-IP best-effort limit of 10 analyses per 10 minutes in `lib/ratelimit.ts`. Best effort is acceptable.
* Env `AI_PROVIDER=none` (the default, and the setting on the hosted demo) disables the AI call entirely. Env `AI_MAX_PER_HOUR` (default 60) caps AI calls per instance per hour when a provider is configured; over the cap, `aiStatus` is `skipped`.
* Committed fixtures in `fixtures/` hold full `RepoAnalysis` JSON for the demo repositories. Env `FIXTURE_FALLBACK=true` serves a fixture when GitHub returns a rate-limit error for one of those repos, so the demo cannot die during voting. The HUD shows a small "cached snapshot" note when this happens.

---

# 31. GitHub credentials

GitHub API credential stays server-side.

Never:

```text
NEXT_PUBLIC_GITHUB_TOKEN
```

Use server-only environment variable.

Never log the token.

Never commit `.env`.

Add secret files to `.gitignore` immediately.

Commit a `.env.example` with placeholder values only:

```text
GITHUB_TOKEN=
AI_PROVIDER=none          # none | anthropic | openai | google | openai-compatible
AI_MODEL=
AI_API_KEY=
AI_BASE_URL=              # openai-compatible only
AI_MAX_PER_HOUR=60
FIXTURE_FALLBACK=true
```

Run a secret scan (`gitleaks detect` or `git log -p | grep -E 'ghp_|github_pat_|sk-ant-'`) as part of the Friday audit.

---

# 32. Recommended stack

## Framework

**Next.js + TypeScript**

Benefits:

* frontend/backend together
* straightforward API handlers
* simple deployment
* familiar ecosystem

## 3D

**Three.js**

via:

**React Three Fiber**

Useful helpers:

**@react-three/drei**

## State

**Zustand**

Keep state small.

## Styling

Tailwind or lightweight CSS.

## Validation

Zod.

## AI

Small provider-agnostic adapter, optional and disabled by default (see section 28).

## Pinned decisions

* Scaffold with `pnpm create next-app@latest` using the App Router, TypeScript, Tailwind, ESLint, no `src/` directory.
* React Three Fiber plus `@react-three/drei` at the versions compatible with the React version the scaffold installs. The Canvas component is loaded with `next/dynamic` and `ssr: false`.
* Package manager: pnpm. Tests: Vitest. Hosting: Vercel, connected to the GitHub repo so every push to `main` deploys.
* No UI component library. Tailwind plus a handful of hand-written overlay components.
* No post-processing library in the MVP. Add `@react-three/postprocessing` only in the Thursday polish pass and only if the frame rate stays above 50 on a laptop.

---

# 33. Suggested structure

```text
/app
  page.tsx

  /api
    /analyze
      route.ts

/components
  RepoInput.tsx
  AnalysisProgress.tsx
  CityCanvas.tsx
  CityHUD.tsx
  Inspector.tsx
  Legend.tsx

/components/city
  City.tsx
  District.tsx
  Building.tsx
  Roads.tsx
  Traffic.tsx
  IssueIncident.tsx
  ConstructionSite.tsx
  PowerPlant.tsx
  TestStation.tsx
  DocumentationCenter.tsx

/components/city
  CameraRig.tsx
  Terrain.tsx
  Landmark.tsx
  Props.tsx

/components
  ErrorBanner.tsx
  Tooltip.tsx

/store
  useCityStore.ts

/lib
  /github
    client.ts
    parseRepoUrl.ts
    repository.ts
    tree.ts
    issues.ts
    pulls.ts
    workflows.ts
    activity.ts
    snapshot.ts        orchestrates the parallel fetches into RepositorySnapshot

  /analysis
    metrics.ts
    scoring.ts
    fileSelection.ts
    districts.ts
    detect.ts          tests, docs, CI, tooling detection
    analyze.ts         snapshot -> RepoAnalysis (calls ai/ with fallback)

  /ai
    analyze.ts
    schema.ts
    prompt.ts

  /city
    generator.ts       RepoAnalysis -> CityModel (runs in the browser)
    layout.ts
    seed.ts
    prng.ts            mulberry32 seeded from a string hash

  cache.ts
  ratelimit.ts

/types
  github.ts
  repository.ts
  analysis.ts
  city.ts

/fixtures
  *.analysis.json     RepoAnalysis fixtures for demo repos and for Monday's fake city

AI_MODELS.md
.env.example
```

Unit tests live next to the code as `*.test.ts`.

---

# 34. CityModel

The renderer must never consume raw GitHub API objects.

Convert everything first.

Example conceptual structure:

```text
CityModel
├── repository
├── health
├── confidence
├── activity
├── districts[]
│   ├── blocks[]
│   └── buildings[]
├── infrastructure[]
├── incidents[]
├── constructionSites[]
└── ambience
```

Interactive entities:

```text
id
type
position
title
description
reason
sourceUrl
sourceData
visualState
appearAt     reveal delay in milliseconds, used by the generation animation
```

Where each layer runs:

* Server (`/api/analyze`): GitHub fetch, `RepositorySnapshot`, deterministic metrics, AI interpretation. The response is a compact `RepoAnalysis` (target under 300 KB, never the raw tree).
* Browser: `RepoAnalysis -> CityModel` in `lib/city/generator.ts`, then rendering. Layout runs client-side so it can be iterated against fixtures without touching the API, and so the Monday fake city and the Tuesday real city use the identical code path.

The full type contracts are in section 71. They are written first, before any workstream starts.

---

# 35. Deterministic generation

Same repository revision should create essentially the same city.

Seed generator using:

```text
owner + repo + defaultBranchSHA
```

Seed controls cosmetic randomness:

* building placement variation
* tree placement
* car appearance
* block variation
* props

Benefits:

* reproducible screenshots
* easier debugging
* city changes naturally as repository changes

---

# 36. Layout

Do not build SimCity.

Use controlled procedural layouts.

### Stage 1

Determine major districts.

### Stage 2

Allocate rectangular district regions.

### Stage 3

Create major roads between them.

### Stage 4

Subdivide into blocks.

### Stage 5

Place important buildings.

### Stage 6

Place infrastructure landmarks.

### Stage 7

Place incidents.

### Stage 8

Place cosmetic props.

Predictability is more valuable than procedural realism.

Layout constraints: the city is a square grid of world units. District regions are allocated by a simple treemap (squarified, area proportional to sqrt of building count) so a large district never dwarfs the rest. Roads run on the treemap seams plus one ring road. Landmarks take fixed reserved slots at the civic center, which is the treemap cell nearest the origin. Incidents sit on road segments, never inside blocks.

---

# 37. Building limits

Suggested maximum:

* 300 buildings
* 100 trees
* 30 to 40 moving cars
* 12 incidents
* 8 construction projects
* a handful of landmarks

Enough to feel alive without becoming a performance problem.

---

# 38. Instancing

Use instanced rendering where appropriate for:

* trees
* lights
* generic buildings
* repeated road props

Avoid hundreds of unnecessary React objects if a simpler Three.js/instancing solution performs better.

Picking with instancing: buildings render as one `InstancedMesh` per visual tier with per-instance color. The pointer handler reads `event.instanceId` and maps it to the entity id through an array kept next to the instance matrices. Hover and selection tint the instance color; they do not spawn extra meshes. Incidents, construction sites, and landmarks are few enough to be ordinary meshes with their own handlers.

---

# 39. Lighting

Keep lighting simple.

Base:

* directional sunlight
* ambient/hemisphere fill
* soft shadows

Health can subtly influence atmosphere.

Healthy:

* warmer
* clearer

Mixed:

* neutral

Struggling:

* slightly desaturated

Archived:

* cooler
* drained palette and a weaker sun, never fog (Robert, 2026-09-22: no atmospheric haze)
* subdued activity

Do not make unhealthy cities visually unreadable.

---

# 40. One-screen interface

The 3D city should occupy essentially the whole experience.

## Top left

```text
REPO CITY
facebook/react
```

## Top center

Initially:

```text
Enter GitHub repository
```

After generation:

```text
Analyze another repo
```

This control overlays the same city.

## Top right

Compact health HUD.

## Bottom left

Legend/help.

## Right side

Context inspector when selected.

No giant permanent application sidebar.

The city is the product.

---

# 41. Inspector

One inspector component handles all meaningful objects.

Issue:

```text
INCIDENT
Issue #481

...
```

PR:

```text
CONSTRUCTION
Pull Request #292

...
```

CI:

```text
POWER GRID
GitHub Actions

...
```

Documentation:

```text
INFORMATION CENTER
Documentation

...
```

File:

```text
BUILDING
src/parser.ts

...
```

Consistent UI makes development much faster.

---

# 42. Hover

Hover gives quick information.

Example:

```text
Core District
/src
```

or:

```text
Incident
Issue #381
```

Essential interaction must also work on click/tap.

Do not depend exclusively on hover.

---

# 43. Generation animation

Target:

**2 to 4 seconds**

Sequence:

1. terrain
2. major roads
3. districts
4. buildings rise
5. landmarks
6. incidents
7. construction
8. traffic starts
9. HUD appears

Keep it fast enough that testing multiple repos is pleasant.

---

# 44. Loading

Loading should communicate analysis rather than show a generic spinner.

Example:

```text
SURVEYING REPOSITORY

✓ Repository discovered
✓ 4,218 files mapped
✓ 134 issues inspected
✓ 8 workflows detected
◌ Mapping architecture
◌ Constructing city
```

If analysis takes longer, rotate through factual stages.

Never fabricate completed stages.

Mechanism: `/api/analyze` returns a streamed newline-delimited JSON body. Each line is either a progress event or the final result:

```json
{"type":"stage","id":"discover","status":"done","detail":"facebook/react"}
{"type":"stage","id":"tree","status":"done","detail":"4,218 files mapped"}
{"type":"stage","id":"ai","status":"running"}
{"type":"result","analysis":{...}}
{"type":"error","code":"NOT_FOUND","message":"..."}
```

Stage ids: `discover`, `tree`, `issues`, `pulls`, `ci`, `activity`, `ai`, `done`. The client renders exactly the events it receives; there is no client-side timer that ticks stages. The route sets `export const maxDuration = 60`.

---

# 45. Sound

P3 feature only.

Possible:

* distant traffic
* quiet construction
* occasional siren
* electrical hum

Default should probably be muted until user enables it.

Do not spend core development time here.

---

# 46. Explicit non-goals

Do not build:

* accounts
* GitHub OAuth
* private repository support
* first-person character
* interiors
* realistic driving
* realistic traffic simulation
* multiplayer
* persistent user database
* code editor
* GitHub issue editing
* AST analysis for every language
* elaborate dependency engine
* custom 3D modelling pipeline
* hundreds of custom assets
* multiple pages
* settings page
* admin dashboard
* mobile-specific alternative app

Scope discipline is part of shipping.

---

# 47. MVP

Repo City is shippable when:

* [ ] public GitHub repo URL can be entered
* [ ] repo data loads
* [ ] city generates
* [ ] city is truly 3D
* [ ] camera rotates
* [ ] camera pans
* [ ] camera zooms
* [ ] buildings reflect repo structure
* [ ] issues create incidents
* [ ] PRs create construction
* [ ] CI creates infrastructure
* [ ] selected object opens inspector
* [ ] inspector explains real GitHub data
* [ ] different repos visibly produce different cities
* [ ] hosted deployment works
* [ ] app remains one persistent screen

This is the minimum.

---

# 48. Priority system

## P0

Must ship:

* city renderer
* camera controls
* GitHub ingestion
* procedural layout
* buildings
* issues
* inspector
* deployment

## P1

Strong submission:

* PR construction
* CI landmark
* tests landmark
* documentation landmark
* health model
* AI architecture interpretation
* generation animation
* camera focus

## P2

Wow factor:

* moving cars
* smoke
* emergency lights
* animated cranes
* pedestrians
* richer abandoned state
* better shadows
* visual polish

## P3

Only after everything works:

* sound
* time machine
* day/night
* dependency traffic
* weather
* advanced sharing

---

# 49. Stretch feature: Repo Time Machine

Only attempt after feature freeze quality is reached.

Bottom overlay:

```text
2021 ─────────────── 2026
                     ▲
```

Moving through time changes the same city.

Buildings appear.

Districts expand.

Issues appear/disappear.

Activity changes.

This still stays in the same persistent world.

Very cool.

Very dangerous for schedule.

Do not touch early.

---

# 50. Monday, September 21

## Goal

A convincing **fake-data** 3D city.

Do not begin by solving GitHub analysis.

Tasks:

1. create new public repository
2. scaffold application
3. create first commit
4. deploy immediately
5. add React Three Fiber
6. create terrain
7. create roads
8. procedural buildings
9. orbit camera
10. zoom/pan
11. selection
12. inspector
13. fake car crash
14. fake construction
15. fake CI plant
16. establish art direction

Fake data is not hardcoded in components. It is a committed `fixtures/sample.analysis.json` that conforms to the real `RepoAnalysis` type, fed through the real generator. Swapping to live data on Tuesday is then a data-source change, not a rewrite.

```text
Health: 72
Issues: 5
Pull Requests: 3
CI: passing
```

With parallel agents, Monday is not only the fake city. The GitHub ingestion and metrics workstreams start the same evening against the type contracts (section 72).

End-of-day test:

**Can someone fly around, click a crash, and understand the concept?**

If yes, proceed.

---

# 51. Tuesday, September 22

## Goal

Connect reality.

Implement:

* repo URL parsing
* GitHub client
* metadata
* repository tree
* commits
* issues
* PRs
* contributors
* workflows
* releases

Create:

`RepositorySnapshot`

Then:

`RepositorySnapshot -> CityModel`

Tuesday-night test:

Analyze at least three real repositories.

They must produce noticeably different cities.

---

# 52. Wednesday, September 23

## Goal

Make the metaphors meaningful.

Implement:

* scoring
* issue prioritization
* PR state
* CI state
* test detection
* docs detection
* archive state
* district extraction
* AI interpretation
* inspector explanations
* confidence score

Wednesday-night test:

Click around a city.

Every important object should correspond to something real.

---

# 53. Thursday, September 24

## Goal

Turn working software into a memorable project.

Improve:

* buildings
* roads
* camera
* lighting
* smoke
* emergency scenes
* construction
* traffic
* generation animation
* HUD
* inspector
* loading
* error handling

Test:

* tiny repo
* huge repo
* archived repo
* issue-heavy repo
* no issues
* no CI
* monorepo
* invalid URL
* nonexistent repo
* API failure
* AI failure

## Thursday night

**Feature freeze.**

After this point:

No major feature work.

---

# 54. Friday, September 25

Hard deadline:

**3:30 PM Newfoundland time**

Friday is not feature day.

## Morning

Only:

* bug fixes
* performance
* visual polish
* deployment verification

## Late morning

Choose demonstration repos.

Record demo.

Capture screenshot.

Finish README.

Write final submission.

Verify AI model declaration.

## Submission target

Aim for:

**12:30 PM to 1:30 PM Newfoundland time**

This leaves a substantial buffer.

Once a good submission is ready, submit rather than intentionally waiting because earliest submission breaks an exact vote tie.

---

# 55. Demo video

Recommended duration:

**45 to 70 seconds**

## 0:00

Repo City open.

One screen.

Paste repository.

## 0:05

Narration:

"Repo City turns a GitHub repository into a living 3D city."

## 0:10

City constructs.

## 0:17

Orbit.

"The architecture becomes the city."

## 0:22

Spot accident.

Fly closer.

## 0:26

Click it.

Real GitHub issue appears.

"That traffic accident is a real unresolved bug."

## 0:33

Move to crane.

"Pull requests become construction."

## 0:39

Power station.

"CI becomes infrastructure."

## 0:44

Health HUD.

"Maintenance, testing, documentation and activity shape the world."

## 0:51

Analyze very different repository.

## 0:58

Second city generates.

It should look dramatically different.

## 1:04

Final aerial shot.

Text:

**One repository. One city. One screen.**

---

# 56. Screenshot

The screenshot should show the project at its best.

Do not use:

* loading screen
* empty input state
* error state

Ideal:

* beautiful aerial 3D composition
* visible roads
* skyline
* crane
* incident
* power infrastructure
* small HUD
* repository name
* maybe inspector visible

The image should communicate "GitHub repository became city" before someone reads the description.

---

# 57. Submission writeup

Maximum official length:

**500 characters.**

Draft later after product exists.

Working direction:

> Repo City turns any public GitHub repository into a living 3D city. Files become buildings, code areas become districts, pull requests become construction, CI powers the grid, and unresolved issues leave visible scars on the world. Fly through the repository, inspect what you find, and understand a codebase without ever leaving one screen.

Check exact final character count before submission. The working draft above is 341 characters, leaving room for a hosted URL.

---

# 58. README

README should contain:

1. Repo City title
2. screenshot/GIF
3. short description
4. One Screen concept
5. visual mapping
6. technical architecture
7. setup instructions
8. environment variables
9. AI usage
10. limitations
11. Hackyard Yard #3 context

Do not spend hours writing README before the application works.

---

# 59. Test repository set

Maintain several reference repos.

## Active healthy repo

Expected:

* lively
* modern
* functioning infrastructure

## Small clean repo

Expected:

* small attractive town

## Archived repo

Expected:

* quiet
* clearly archived feel

## Issue-heavy repo

Expected:

* visibly more incidents

## Monorepo

Expected:

* multiple major districts

This prevents tuning everything around one demo repository.

Candidate repositories (verify each still fits its category on Tuesday; swap if not):

```text
active healthy    honojs/hono, vitejs/vite
small clean       sindresorhus/p-limit, tj/commander.js
archived          atom/atom, facebook/flux
issue-heavy       microsoft/vscode, facebook/react
monorepo          vercel/turborepo, pnpm/pnpm
no CI / tiny      any small personal repo with no workflows
huge tree         torvalds/linux (expect tree truncation)
```

The demo video uses two of these. Their fixtures are committed (section 30).

---

# 60. Invalid input

### Invalid GitHub URL

```text
That doesn't look like a GitHub repository.
```

### Missing or private repository

GitHub returns the same 404 for a missing repository and a private one the token cannot see, so one message covers both:

```text
Repository not found. Repo City only supports public repositories.
```

### Very large repository

```text
This repository is very large. The city is built from a partial survey.
```

### Analysis timeout

```text
Survey took too long. Please try again.
```

### API limit

```text
GitHub is temporarily limiting analysis.
Please try again shortly.
```

### AI failure

Still construct deterministic city.

```text
Architecture interpretation unavailable.
The city was generated from repository metadata.
```

---

# 61. No issues

No incidents.

This is good.

Do not manufacture problems because the scene looks empty.

---

# 62. No CI

No major power landmark or show basic infrastructure.

Do not present "No GitHub Actions" as CI failure.

The project might use another CI provider.

---

# 63. Performance fallback order

If performance becomes bad, remove/reduce in this order:

1. expensive post-processing
2. excessive realtime shadows
3. pedestrians
4. decorative particles
5. tree count
6. car count
7. tiny props

Never sacrifice:

* city
* buildings
* incidents
* selection
* camera
* inspector

Those define the product.

---

# 64. Design test

For every proposed feature, ask:

> **Can the user see its meaning in the city?**

If not, question whether it belongs.

Good:

* recent commits cause activity
* CI failures affect power infrastructure
* bugs cause accidents
* stale PR creates abandoned construction

Weak:

* separate analytics table
* eight bar charts
* traditional dashboard
* giant metrics page

Repo City is physical storytelling.

---

# 65. Architecture rule

Maintain three layers:

```text
DATA
GitHub facts

INTERPRETATION
Metrics + AI

WORLD
3D city
```

Never blur these unnecessarily.

This protects the project during rapid iteration.

---

# 66. What makes Repo City interesting

The project is not trying to beat:

* GitHub Insights
* SonarQube
* code-quality tooling
* security scanners
* repository dashboards

Its purpose is different.

It asks:

**What if a software project were a physical place?**

Code becomes architecture.

Bugs become damage.

Pull requests become construction.

CI becomes utilities.

Documentation becomes navigation.

Contributors create life.

Maintenance determines whether the place feels cared for.

---

# 67. UX success test

Give someone the app without explanation.

They should be able to:

1. paste repository
2. understand that the generated city represents it
3. move around
4. notice an interesting object
5. click it
6. discover real GitHub information
7. understand why that information has that visual metaphor
8. continue exploring without leaving the city

If all eight happen, the core experience works.

---

# 68. Hackyard-theme success test

Before submission, ask:

**Could someone reasonably describe this as multiple screens?**

If yes:

redesign it.

At every moment:

* the city remains the application
* camera changes do not create new pages
* details overlay the world
* navigation never replaces the world
* repository switching happens inside the same interface

The phrase we should be able to defend is:

> **Repo City contains an entire codebase in one explorable screen.**

---

# 69. Final product promise

> **Paste any public GitHub repository and watch it become a living 3D city. Code becomes architecture, pull requests become construction, CI becomes infrastructure, and unresolved issues leave visible scars on the world. Fly through the entire project without ever leaving one screen.**

Everything built during Yard #3 should strengthen that promise.

---

# 70. Final pre-submission audit

## Hackyard

* [ ] One Screen theme clearly satisfied
* [ ] Public repository
* [ ] Solo build
* [ ] Code created within build window
* [ ] No personal pre-existing project code reused
* [ ] Accurate AI model declaration
* [ ] Writeup under 500 characters
* [ ] Submission made before deadline
* [ ] Demo URL works
* [ ] Screenshot displays correctly

## Security

* [ ] `.env` ignored
* [ ] no GitHub token committed
* [ ] no AI key committed
* [ ] git history checked for secrets (secret scan run, section 31)
* [ ] GitHub repository visibility is public
* [ ] `AI_MODELS.md` matches the submission's model declaration

## Product

* [ ] production URL works in private browser
* [ ] at least five repositories tested
* [ ] camera controls work
* [ ] touch/basic mobile behavior works
* [ ] issue inspection works
* [ ] PR construction works
* [ ] CI representation works
* [ ] AI failure fallback works
* [ ] GitHub failure handled
* [ ] city remains one screen

## Presentation

* [ ] screenshot is strong
* [ ] demo starts quickly
* [ ] demo explains issue metaphor
* [ ] demo shows 3D camera movement
* [ ] demo shows real repository data
* [ ] demo ends with best city shot

## Final check

* [ ] Someone unfamiliar with Repo City can understand it
* [ ] Nothing important requires reading the README
* [ ] Core interaction works without explanation
* [ ] No unfinished experimental feature hurts the demo
* [ ] Production build is stable

**Then ship.**

---

# 71. Type contracts

These types are the contract between workstreams. They are written and committed first (workstream W0), and any change to them after that point is announced to every active agent. Names below are binding; field additions are allowed, renames are not.

## 71.1 `types/repository.ts` (DATA layer, server only)

```ts
export interface RepositorySnapshot {
  repo: {
    owner: string; name: string; fullName: string; url: string;
    description: string | null; defaultBranch: string; headSha: string;
    stars: number; forks: number; openIssuesCount: number;
    archived: boolean; isFork: boolean; createdAt: string; pushedAt: string;
    license: string | null; primaryLanguage: string | null; topics: string[];
  };
  tree: { truncated: boolean; totalEntries: number; entries: TreeEntry[] }; // pruned
  commits: { sha: string; date: string; authorLogin: string | null; message: string }[];
  issues: IssueSummary[];
  pulls: PullSummary[];
  contributors: { login: string; contributions: number }[];
  workflows: { id: number; name: string; path: string; state: string }[];
  workflowRuns: { id: number; workflowId: number; name: string; status: string;
                  conclusion: string | null; createdAt: string; url: string }[];
  releases: { tag: string; name: string | null; publishedAt: string; url: string }[];
  files: { path: string; content: string }[];   // README, manifests; each <= 8 KB
  fetchedAt: string; requestCount: number; warnings: string[];
}
export interface TreeEntry { path: string; type: "blob" | "tree"; size?: number }
export interface IssueSummary {
  number: number; title: string; url: string; createdAt: string; updatedAt: string;
  comments: number; labels: string[]; author: string | null; bodyExcerpt: string;
}
export interface PullSummary {
  number: number; title: string; url: string; createdAt: string; updatedAt: string;
  mergedAt: string | null; draft: boolean; comments: number; labels: string[];
  author: string | null; state: "open" | "merged" | "closed";
}
```

## 71.2 `types/analysis.ts` (INTERPRETATION layer, crosses the wire)

```ts
export type CiState = "healthy" | "recent-failure" | "failing" | "unknown" | "none";
export type IncidentState = "major" | "collision" | "stale" | "minor";
export type ConstructionState = "active" | "slow" | "abandoned" | "completed";

export interface RepoMetrics {
  scale: { files: number; dirs: number; languages: Record<string, number>; tier: "tiny" | "small" | "medium" | "large" | "huge" };
  activity: { commitsLast30d: number; commitsLast90d: number; activeContributors90d: number;
              lastPushDaysAgo: number; score: number /* 0..1 */ };
  issues: { open: number; ranked: RankedIssue[]; staleShare: number };
  pulls: { open: number; ranked: RankedPull[]; staleShare: number };
  ci: { state: CiState; provider: "github-actions" | "other" | "none"; failureRate: number; recentRuns: number };
  tests: { strength: 0 | 1 | 2 | 3; signals: string[] };
  docs: { strength: 0 | 1 | 2 | 3; signals: string[]; readmeLength: number };
  tooling: { signals: string[] };
  releases: { count: number; lastDaysAgo: number | null; cadence: "active" | "occasional" | "none" };
  health: { score: number; band: "Critical" | "Struggling" | "Mixed" | "Healthy" | "Thriving";
            breakdown: { maintenance: number; reliability: number; documentation: number;
                         organization: number; responsiveness: number } };
  confidence: { level: "low" | "medium" | "high"; reasons: string[] };
  archived: boolean;
}
export interface RankedIssue extends IssueSummary { score: number; state: IncidentState; reason: string; relatedPath: string | null }
export interface RankedPull extends Omit<PullSummary, "state"> { score: number; state: ConstructionState; reason: string }  // "completed" means merged; other states mean open

export interface DistrictPlan { id: string; sourcePath: string; name: string; purpose: string | null; fileCount: number; weight: number }
export interface BuildingPlan {
  id: string; path: string; kind: "file" | "directory"; districtId: string;
  score: number; tier: 1 | 2 | 3 | 4 | 5; descendantCount: number; language: string | null;
  role: string | null;             // from AI importantModules when matched
  landmark: "readme" | "manifest" | "contributing" | "changelog" | "dockerfile" | null;
}
export interface AiInterpretation {
  summary: string;
  districts: { sourcePath: string; name: string; purpose: string; evidence: string[] }[];
  importantModules: { path: string; role: string; evidence: string[] }[];
  strengths: string[]; concerns: string[];
  organizationClarity: number;     // 0..1
  model: string;
}
export interface RepoAnalysis {
  repo: RepositorySnapshot["repo"];
  metrics: RepoMetrics;
  districts: DistrictPlan[];
  buildings: BuildingPlan[];
  ai: AiInterpretation | null;
  aiStatus: "ok" | "skipped" | "failed";
  seed: string;                    // `${owner}/${name}@${headSha}`
  warnings: string[];
  generatedAt: string;
  source: "live" | "fixture";
}
```

## 71.3 `types/city.ts` (WORLD layer, browser only)

```ts
export type Vec3 = [number, number, number];
export type EntityKind = "building" | "district" | "incident" | "construction" | "landmark";
export interface CityEntity {
  id: string; kind: EntityKind; position: Vec3; rotationY: number;
  title: string; subtitle: string; description: string; reason: string;
  sourceUrl: string | null; visualState: string; appearAt: number;
}
export interface Building extends CityEntity { kind: "building"; districtId: string; size: Vec3; tier: 1|2|3|4|5; colorIndex: number; plan: BuildingPlan }
export interface Incident extends CityEntity { kind: "incident"; state: IncidentState; issue: RankedIssue }
export interface ConstructionSite extends CityEntity { kind: "construction"; state: ConstructionState; pull: RankedPull }
export interface Landmark extends CityEntity { kind: "landmark"; landmarkType: "power" | "fire" | "info" | "station" | "civic"; level: 0|1|2|3; state: string }
export interface District { id: string; name: string; sourcePath: string; purpose: string | null; rect: { x: number; z: number; w: number; d: number }; colorIndex: number; buildingIds: string[] }
export interface RoadSegment { id: string; from: Vec3; to: Vec3; width: number; major: boolean }
export interface CityModel {
  repository: { fullName: string; url: string; archived: boolean };
  health: RepoMetrics["health"]; confidence: RepoMetrics["confidence"];
  activity: RepoMetrics["activity"];
  ambience: { warmth: number; saturation: number; fog: number; trafficDensity: number; pedestrianDensity: number; litWindowShare: number };
  bounds: { size: number };
  districts: District[]; buildings: Building[]; roads: RoadSegment[];
  landmarks: Landmark[]; incidents: Incident[]; constructionSites: ConstructionSite[];
  props: { trees: Vec3[]; lamps: Vec3[] };
  vehicles: { count: number };
  seed: string;
}
```

## 71.4 Store shape (`store/useCityStore.ts`)

```ts
{
  phase: "idle" | "analyzing" | "building" | "ready" | "error";
  stages: { id: string; label: string; status: "pending" | "running" | "done" | "failed"; detail?: string }[];
  analysis: RepoAnalysis | null;
  city: CityModel | null;
  selectedId: string | null;
  hoveredId: string | null;
  error: { code: string; message: string } | null;
  actions: { analyze(input: string): Promise<void>; select(id | null); hover(id | null); returnToOverview(); }
}
```

---

# 72. Parallel workstreams

The plan is executed by one orchestrator (Claude Fable 5.1) and several implementation agents (Claude Opus 5) working in isolated git worktrees. Robert is the sole human. Every agent reads this plan and section 0 before touching code.

## W0. Foundation (serial, first, about one hour)

* scaffold Next.js app, Tailwind, ESLint, Vitest, pnpm
* `.gitignore`, `.env.example`, `AI_MODELS.md`, `README.md` stub
* all files in `types/` exactly as section 71
* `fixtures/sample.analysis.json` hand-written to those types (one fake mid-size repo: 6 districts, about 90 buildings, 5 issues, 3 PRs, CI healthy, tests strength 2, docs strength 3)
* `lib/city/prng.ts`, `lib/city/seed.ts`
* `store/useCityStore.ts` with the shape above and a fixture-loading `analyze()`
* `app/page.tsx` renders a full-screen `CityCanvas` placeholder plus HUD skeleton
* `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass
* first commit, push, connect Vercel, confirm the placeholder deploys

Nothing else starts until W0 is merged to `main`.

## W1 to W6 (parallel, isolated worktrees, disjoint directories)

| Workstream | Owns | Depends on |
|---|---|---|
| W1 City renderer | `components/city/*`, `components/CityCanvas.tsx` | W0 types, fixture, W5 generator output shape (uses fixture-generated CityModel until W5 lands) |
| W2 GitHub ingestion | `lib/github/*`, `app/api/analyze/route.ts` (streaming skeleton), `lib/cache.ts`, `lib/ratelimit.ts` | W0 types |
| W3 Metrics and scoring | `lib/analysis/*` except `analyze.ts` orchestration of AI | W0 types; tested against a hand-written `RepositorySnapshot` fixture it creates |
| W4 AI interpretation | `lib/ai/*` | W0 types |
| W5 City generator | `lib/city/generator.ts`, `lib/city/layout.ts` | W0 types and fixture |
| W6 HUD and overlays | `components/*.tsx` except CityCanvas, `app/page.tsx` wiring, `store/*` | W0 store shape |

Rules for every agent:

* work only inside the owned paths; if a change outside them is unavoidable, describe it in the final report instead of making it
* do not modify `types/*`; if a type is insufficient, report the exact proposed addition
* `pnpm typecheck && pnpm lint && pnpm test` must pass before reporting done; add tests for pure logic
* commit on the worktree branch with clear messages; the orchestrator merges
* append your model name to `AI_MODELS.md` if missing
* never write secrets, never add `NEXT_PUBLIC_` variables holding tokens
* no new dependencies beyond the pinned stack without stating why in the report

## W7. Integration (serial, after W1 to W6 merge)

* wire `store.analyze()` to the streaming API, real progress events, real errors
* run the reference repository set (section 59) end to end
* capture fixtures for the two demo repos
* deploy, verify on the hosted URL

## W8. Polish and presentation (Thursday)

* generation animation, traffic, smoke, emergency lights, cranes, lighting by health, archived treatment
* README, screenshot, demo, writeup

---

# 73. Verification gates

Each milestone has an executable check, not a feeling.

| Gate | Check |
|---|---|
| W0 done | `pnpm build` passes; hosted URL shows the canvas; `types/` matches section 71 |
| Monday | fixture city renders; orbit, pan, zoom, click-to-inspect work on the hosted URL |
| Tuesday | `/api/analyze` returns valid `RepoAnalysis` for three reference repos in under 15 seconds each; the three cities are visibly different in a screenshot |
| Wednesday | every incident, construction site, and landmark in the inspector links to a real GitHub URL; the default `AI_PROVIDER=none` renders the full city; curated interpretations load for the reference repos |
| Thursday | all eleven test cases in section 53 pass manually; feature freeze commit tagged `freeze` |
| Friday | section 70 audit fully checked; submission recorded with timestamp |

Automated tests required in the MVP (Vitest):

* `parseRepoUrl`: accepts `https://github.com/o/r`, `github.com/o/r`, `o/r`, trailing slashes, `.git`, tree and blob URLs; rejects everything else
* `scoring`: known metric inputs produce the expected health numbers; stars do not change health
* `fileSelection`: a 5,000-entry synthetic tree yields between 75 and 300 buildings with no empty district
* `generator`: same `RepoAnalysis` yields byte-identical `CityModel` across two runs; different seeds yield different prop placement
* `issues ranking`: the four visual states are assigned as specified in section 11

---

# 74. Open items for Robert

1. Confirm the Yard #3 check-in completed before kickoff (section 0.12).
2. Approve flipping `Robertg761/Repo-City` to public (section 0.9).
3. Provide `GITHUB_TOKEN` (fine-grained, public read only) for Vercel and a local `.env.local`. No AI key: decided 2026-09-21, runtime AI ships disabled and multi-provider.
4. Name the model that drafted the original plan, for `AI_MODELS.md`.
5. Hosting: Vercel project `repo-city` on team `robertg761s-projects`, production URL `https://repo-city-five.vercel.app` (the bare `repo-city.vercel.app` belongs to an unrelated project). Deployment protection limited to previews so production is public. Deploys run from the CLI with `vercel deploy --prod --yes` until the Vercel GitHub app is installed.

---

# 75. Enhancement round (Tuesday, September 22)

The MVP and polish rounds shipped on Monday. Robert's direction for Tuesday: richer 3D models, more beauty, more detail, while keeping the section 4 art direction (stylized low-poly diorama, procedural geometry, no downloaded asset packs) and the section 63 performance order. Five parallel agents, disjoint ownership:

| Agent | Owns | Goal |
|---|---|---|
| E1 Buildings | `components/city/Buildings.tsx`, `Building.tsx`, `components/city/models/buildings/**` | Architectural archetypes by tier and role, facade detail, rooftop props, per-district palettes, still instanced |
| E2 Landmarks | `components/city/Landmark.tsx`, `components/city/models/landmarks/**` | Detailed power plant with pylons and lines, fire station with bays, visitor centre, transit station with trains, town hall, civic file buildings |
| E3 Life | `Traffic.tsx`, `Props.tsx`, `IssueIncident.tsx`, `ConstructionSite.tsx`, `components/city/models/{vehicles,props}/**`, new `Pedestrians.tsx` | Vehicle variety with wheels, emergency vehicles, pedestrians, tree species, street furniture, richer incidents and construction |
| E4 Atmosphere | `CityCanvas.tsx`, `Lighting.tsx`, `Terrain.tsx`, `Roads.tsx`, `effects.tsx`, `palette.ts`, new `Environment.tsx`, `SelectionRing.tsx` | Sky, sun, tone mapping, sidewalks and road markings, ambient occlusion and bloom behind an automatic quality tier, optional time-of-day |
| E5 Depth | `lib/city/**`, `lib/analysis/**`, `types/**` (additive), HUD and inspector components, `lib/client/**`, `fixtures/interpretations/**` | Forks as highways, stars as visitor traffic, releases as arriving trains, richer inspector facts, deeper curated interpretations |

Performance gate for the round: 60 fps on the 300-building city on a discrete GPU, and an automatic quality step-down (no post-processing, smaller shadow map) when the first three seconds average worse than 25 ms per frame. Every agent screenshots before and after and keeps section 37 limits.


---

# 76. Settlements: village, town, city, metropolis, and every open issue and PR

Robert, 2026-09-22: "I want there to be different City types. Like full big city if it's a big repo. Maybe a smaller town if it's small. A village if it's smaller. This will require different building types and stuff. I also want it to be physically larger if it's a large city. I want every single issue and PR to show up as something in the city, whether that's construction, road block, car accident, a fire, anything."

Later the same day: "Don't worry about the time." This section is therefore designed for the best result, not the fastest landing. It amends sections 30 (request budget), 34 (payload size), 37 (limits), 43 (reveal window) and 71 (types, additively).

## 76.1 Decisions

1. There are four settlement tiers: `village`, `town`, `city`, `metropolis`. Metropolis is for giants (react, vscode, next.js, linux). Mid-to-large repositories are cities.
2. Codebase size sets the base tier. The measure is files plus directories, counted before any cap. Activity can raise the tier one step, and only when the repository already sits in the upper third of its band. Activity never lowers a tier. An archived repository is never promoted. A huge abandoned repo is a big quiet city, and a tiny busy repo is a lively village.
3. Classification runs on the server in `lib/analysis`, where the uncapped counts exist. The result crosses the wire as `RepoAnalysis.settlement`. The generator reads `analysis.settlement?.tier ?? "city"`, so any analysis without the field, old cache entries and old fixtures included, renders exactly as it does today.
4. Every open issue and every open PR becomes its own object in the world, up to 1,000 open issues and 500 open PRs, most recently active first. Anything past the ceilings, or past what the survey reached in time, or past the ground the settlement has room for, appears as a queue at the city limits: a signboard reading "+20,112 more open issues" plus stationary gridlock on the approach roads. The numbers come from the repository's real open totals.
5. There are two levels of detail. "Heroes" are the existing animated `IssueIncident` and `ConstructionSite` assemblies with their emergency vehicles, capped per tier (6 to 16 incidents, 3 to 10 sites). "Crowd" objects are everything else. They draw as instanced cheap forms (roadblocks, fender-benders, small fires, wrecks, potholes, survey pegs, signposts, scaffolds, trenches, works vans, hoardings). Every crowd object can be hovered, clicked and inspected.
6. Health must not move because of this feature. Health and confidence keep reading exactly today's samples: the first 100 open issues by comment count, and the first 50 open PRs by update time. A test pins this.
7. Each tier has its own look. The village has cottages, farmhouses, barns, a chapel on a green, a lane network and fields. The town has a high street of shops, small civic buildings and low apartment blocks. The city is today's look. The metropolis is today's look scaled up, with more and taller towers, avenues, a highway ring and highways out.
8. Physical size scales with tier, in non-overlapping bands for typical repositories. A village is 80 to 125 units across and a metropolis 285 to 320, so the metropolis covers about eight times the ground.
9. The settlement name in the HUD is "Village of p-limit", "Town of zustand", "City of hono" or "Greater react". It uses the repository name, not the owner. Hovering it gives the reason.
10. Ingestion stays on REST for listing, because REST pages can be fetched in parallel by page number. GraphQL is used only where it does something REST cannot do cheaply: exact open totals in one call, and per-PR review decision, CI rollup, comment and reaction counts, and touched file paths, fetched as aliased batches in parallel.

## 76.2 What the code does today (verified, and why it matters)

- `lib/github/issues.ts` `fetchIssues` makes one request: `sort=comments`, `per_page=100`. It drops PR items. `lib/github/pulls.ts` `fetchPulls` makes one open page (`OPEN_PULLS_PER_PAGE = 50`) and one closed page (30). `GitHubClient.getList` throws away response headers, so the `Link` header is never read.
- `lib/analysis/metrics.ts` slices issues to `MAX_INCIDENTS = 12`, and pulls to `MAX_OPEN_CONSTRUCTION = 6` plus `MAX_COMPLETED_CONSTRUCTION = 2`. `metrics.issues.open` and `metrics.pulls.open` are sample sizes, not repository totals. `scoring.ts` reads `issues.staleShare`, `pulls.staleShare`, `issues.open` and `recentlyTouchedIssues(snapshot)`, which is why decision 6 matters.
- `lib/github/tree.ts` `pruneTree` drops paths deeper than 6 segments and caps at `MAX_ENTRIES = 5000`, half of it reserved for directories. `metrics.scale.files` is counted after that cap. The vscode fixture shows 2,013 files (2,500 surveyed) against react's 2,806, so today's file count cannot tell vscode from react. Classification needs new uncapped counts.
- The react fixture has only 115 buildings, because `selectBuildings` fell through granularity levels to depth 2. A metropolis needs a building floor, otherwise it is a big plate with nothing on it.
- `lib/city/layout.ts`: `districtSquareSide = clamp(40 + 7.2·√n, 56, 170)` and `cityBoundsSize` add the landmark band, ring gap, ring road and margin. Size is about 108 at 10 buildings and 226 at 300. Road widths (7 and 4.5), `TARGET_BLOCK` (22) and `TARGET_PITCH` (7.2) are file constants.
- `lib/city/generator.ts` `findRoadSpot` checks each candidate spot against every incident already placed. That is quadratic, fine for 12 and not for 1,500. `components/city/blockages.ts` `blockedStretches` loops segments times obstacles, and its own comment says "twenty-odd obstacles at most".
- `components/city/useEntity.ts` `useInstanceHandlers(ids)` already maps `event.instanceId` to an entity id for buildings. The crowd reuses that pattern.
- `components/CityCanvas.tsx` sets camera `far: 2000`. `Environment.tsx` caps the sky dome radius at `min(max(size*4, 700), 1400)`. `Lighting.tsx` fits one 2048 shadow map over `size * (0.62 + 0.22·evening)`. `components/city/entities.ts` `cameraBoundary` has a 24-unit ceiling written for 23-unit towers. All of these are checked at metropolis scale in 76.5.
- `lib/client/entities.ts` `resolveEntity` and `components/city/entities.ts` `focusTargetFor` search the arrays linearly. That is acceptable at 1,500 items, but a shared index is cleaner (S0).

## 76.3 Type contracts

All additive. Names are binding, as in section 71. Every new field is optional, so every existing fixture still type-checks and renders as it does today.

### `types/repository.ts`

```ts
export interface RepositorySnapshot {
  // ...existing fields...
  tree: {
    truncated: boolean;
    totalEntries: number;
    entries: TreeEntry[];
    /** Blobs that passed the exclusions, counted BEFORE the depth cap and the 5,000-entry cap. */
    totalFiles?: number;
    /** Directories that passed the exclusions, counted the same way. */
    totalDirs?: number;
    /** GitHub itself truncated the recursive listing (100,000 entries or 7 MB). */
    githubTruncated?: boolean;
  };
  /**
   * Open issues beyond `issues`, most recently updated first. Never repeats a
   * number from `issues`, which stays the comment-sorted health sample.
   */
  issueBacklog?: IssueSummary[];
  /** Real open totals for the overflow queue. */
  openTotals?: OpenTotals;
  /** How far the survey got before a budget ran out. */
  coverage?: SurveyCoverage;
}

export interface OpenTotals {
  issues: number;
  pulls: number;
  /** False when estimated from `open_issues_count` minus a PR count. */
  exact: boolean;
  source: "graphql" | "rest-link" | "estimate";
}

export interface SurveyCoverage {
  issuePages: { planned: number; received: number };
  pullPages: { planned: number; received: number };
  enrichment: "complete" | "partial" | "skipped";
  stoppedBy: "deadline" | "rate-limit" | "error" | null;
}

export interface IssueSummary {
  // ...existing fields...
  /** `reactions.total_count` from the REST issue object. */
  reactions?: number;
  assignees?: number;
  milestone?: string | null;
}

export type PullReview = "approved" | "changes-requested" | "review-required";
export type PullChecks = "passing" | "failing" | "pending";

export interface PullSummary {
  // ...existing fields...
  reactions?: number;
  requestedReviewers?: number;
  headSha?: string;
  /** GraphQL enrichment; null or absent when enrichment did not run. */
  review?: PullReview | null;
  checks?: PullChecks | null;
  /** Up to 8 touched paths, from GraphQL `files(first: 8)`. */
  files?: string[];
  changedFiles?: number;
}
```

### `types/analysis.ts`

```ts
import type { PullChecks, PullReview, SurveyCoverage } from "./repository";

export type SettlementTier = "village" | "town" | "city" | "metropolis";

export interface SettlementPlan {
  tier: SettlementTier;
  /** Tier from size alone, before any activity promotion. */
  baseTier: SettlementTier;
  promoted: boolean;
  /** totalFiles + 2 * totalDirs, the number the thresholds read. */
  footprint: number;
  files: number;
  dirs: number;
  /** The counts are a floor: GitHub truncated the tree, or a legacy fixture was capped. */
  lowerBound: boolean;
  activity: { commitsLast90d: number; activeContributors90d: number; busy: boolean };
  /** Inspector and HUD sentence, generated from the rule that matched. */
  reason: string;
}

/** What an issue looks like in the street. Severity stays in `IncidentState`. */
export type IncidentForm =
  | "fire" | "collision" | "wreck" | "pothole" | "roadblock" | "survey" | "signpost";

/** What a pull request looks like. `site` is the hero crane site. */
export type WorksForm = "site" | "scaffold" | "trench" | "van" | "hoarding";

/**
 * Compact open issue for the crowd. No body and no URL: the body is only used
 * server side for `relatedPath`, and the URL is `${repo.url}/issues/${number}`.
 */
export interface BacklogIssue {
  number: number;
  title: string;              // at most 140 characters
  createdAt: string;
  updatedAt: string;
  comments: number;
  reactions: number;
  labels: string[];           // at most 4, each at most 32 characters
  author: string | null;
  state: IncidentState;
  form: IncidentForm;
  score: number;
  relatedPath: string | null;
  /** 0..1 from discussion and reactions; drives scale and beacon brightness. */
  heat: number;
}

export interface BacklogPull {
  number: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  draft: boolean;
  comments: number;
  reactions: number;
  labels: string[];
  author: string | null;
  state: ConstructionState;   // never "completed" in the backlog
  form: WorksForm;            // never "site"
  score: number;
  relatedPath: string | null;
  files: string[];            // at most 5
  review: PullReview | null;
  checks: PullChecks | null;
  heat: number;
}

export interface RankedIssue extends IssueSummary {
  // ...existing fields...
  form?: IncidentForm;
  heat?: number;
}

export interface RankedPull extends Omit<PullSummary, "state"> {
  // ...existing fields...
  form?: WorksForm;
  relatedPath?: string | null;
  heat?: number;
}

export interface RepoMetrics {
  scale: {
    // ...existing fields...
    totalFiles?: number;
    totalDirs?: number;
    lowerBound?: boolean;
  };
  issues: {
    open: number; ranked: RankedIssue[]; staleShare: number;   // unchanged meaning: the health sample
    /** Real open issue total, for the HUD and the overflow queue. */
    total?: number;
    /** Every other open issue surveyed, significance order, heroes excluded. */
    backlog?: BacklogIssue[];
  };
  pulls: {
    open: number; ranked: RankedPull[]; staleShare: number;    // unchanged meaning
    total?: number;
    backlog?: BacklogPull[];
  };
  // ...rest unchanged...
}

export interface RepoAnalysis {
  // ...existing fields...
  settlement?: SettlementPlan;
  coverage?: SurveyCoverage;
  totalsExact?: boolean;
}
```

### `types/city.ts`

```ts
import type { IncidentForm, SettlementTier, WorksForm } from "./analysis";

export type EntityKind =
  | "building" | "district" | "incident" | "construction" | "landmark" | "overflow";

/** Unknown kinds draw as "street". */
export type RoadKind = "street" | "highway" | "lane" | "avenue";

export interface RoadSegment {
  // ...existing fields...
  /** Town high street: shops face it. */
  main?: boolean;
}

/** Hero: the animated assembly. Crowd: one instance of an instanced form. */
export type Lod = "hero" | "crowd";

export interface Incident extends CityEntity {
  // ...existing fields...
  form?: IncidentForm;
  lod?: Lod;
  /** Sits in a traffic lane and closes it (blockages.ts). Kerbside otherwise. */
  lane?: boolean;
  /** Footprint `[w, h, d]` in the incident's own frame; crowd only. */
  size?: Vec3;
  heat?: number;
}

export interface ConstructionSite extends CityEntity {
  // ...existing fields...
  form?: WorksForm;
  lod?: Lod;
  lane?: boolean;
  /** Scaffold host. `position` is then the host's facade centre and `rotationY` faces out. */
  buildingId?: string | null;
  heat?: number;
}

export interface Building extends CityEntity {
  // ...existing fields...
  /** Town slot on the high street: the renderer puts a shopfront here. */
  frontage?: "main-street" | null;
}

export interface SettlementInfo {
  tier: SettlementTier;
  /** "Village of p-limit", "Town of zustand", "City of hono", "Greater react". */
  name: string;
  reason: string;
}

export interface FieldPatch { x: number; z: number; w: number; d: number; rotationY: number; crop: 0 | 1 | 2 | 3 }

export interface OverflowCount { total: number; drawn: number; hidden: number }

export interface Overflow extends CityEntity {
  kind: "overflow";
  issues: OverflowCount;
  pulls: OverflowCount;
  exact: boolean;
  /** Signboard plot `[w, h, d]`. */
  size: Vec3;
  /** Stationary queue on the approach roads, one entry per car. */
  queue: { position: Vec3; rotationY: number; body: number; roadId: string }[];
}

export interface CityModel {
  // ...existing fields...
  settlement?: SettlementInfo;
  /** Crowd-level objects. `incidents` and `constructionSites` stay heroes only. */
  backlog?: { incidents: Incident[]; constructionSites: ConstructionSite[] };
  overflow?: Overflow | null;
  /** Civic ground: paved plaza (city), setts (town), grass green (village). */
  plaza?: { rect: { x: number; z: number; w: number; d: number }; surface: "paved" | "setts" | "green" };
  props: { trees: Vec3[]; lamps: Vec3[]; fields?: FieldPatch[] };
}

export type SelectableEntity = Building | Incident | ConstructionSite | Landmark | Overflow;
```

Crowd objects are genuine `Incident` and `ConstructionSite` values. The generator turns each `BacklogIssue` into a `RankedIssue` (`bodyExcerpt: ""`, URL derived from `repo.url`, `reason` from `lib/city/entities.ts`). Every existing inspector, focus and tooltip path therefore works on them unchanged. They live in `city.backlog`, a separate array, so a renderer that knows nothing about it simply does not draw them. Nothing old ever tries to draw 1,500 hero assemblies.

### `types/github.ts` (S1 owns; listed here because they are additive)

```ts
export interface GhIssue { /* ... */ reactions?: { total_count: number }; assignees?: GhUser[]; milestone?: { title: string } | null }
export interface GhPull  { /* ... */ requested_reviewers?: GhUser[] }
export interface GhGraphTotals { data?: { repository: { issues: { totalCount: number }; pullRequests: { totalCount: number } } | null } }
export interface GhGraphPull {
  number: number;
  reviewDecision: "APPROVED" | "CHANGES_REQUESTED" | "REVIEW_REQUIRED" | null;
  comments: { totalCount: number };
  reactions: { totalCount: number };
  changedFiles: number;
  files: { nodes: { path: string }[] } | null;
  commits: { nodes: { commit: { statusCheckRollup: { state: string } | null } }[] };
}
```

## 76.4 Settlement classification

`lib/analysis/settlement.ts`, pure and unit tested.

```text
footprint = totalFiles + 2 * totalDirs
  totalFiles / totalDirs: counted in lib/github/tree.ts pruneTree, for entries that
  pass isExcluded, BEFORE the depth-6 skip and the 5,000 cap. The depth skip
  would otherwise undercount deep Java trees.

base tier
  village      footprint <    120
  town         footprint <    600
  city         footprint < 10,000
  metropolis   footprint >= 10,000, or githubTruncated

promotion, one step at most, never when archived, needs lastPushDaysAgo <= 30
  village -> town         footprint >=    40  and commitsLast90d >= 30 and activeContributors90d >= 4
  town -> city            footprint >=   200  and commitsLast90d >= 60 and activeContributors90d >= 12
  city -> metropolis      footprint >= 3,334  and commitsLast90d >= 90 and activeContributors90d >= 20
  (the size condition is "upper third of the band": next threshold / 3)
```

`commitsLast90d` saturates at 100, because the commits request is one page. The metropolis step asks for 90, which in practice means "saturated". `activeContributors90d` is counted from those same commits.

Calibration. Fixture rows use the real numbers in `fixtures/*.analysis.json`, with `surveyedFiles` standing in for `totalFiles`. Rows marked "est." are my estimates, to be replaced by live values in integration step I.

| Repository | files | dirs | footprint | base | activity | tier |
|---|---|---|---|---|---|---|
| a 20-file library | 20 | 2 | 24 | village | any | village |
| sindresorhus/p-limit (fixture) | 16 | 1 | 18 | village | 7 commits, 3 people | village |
| pmndrs/zustand (est.) | ~180 | ~35 | ~250 | town | ~8 active people, not busy | town |
| expressjs/express (est.) | ~190 | ~30 | ~250 | town | not busy | town |
| honojs/hono (fixture) | 470 | 110 | 690 | city | busy, but not in the metropolis zone | city |
| atom/atom (fixture, archived) | 1,139 | 295 | 1,729 | city | archived | quiet city |
| vercel/turborepo (fixture) | 2,887 | 1,392 | 5,671 | city, in zone | 9 active people | city |
| react/react (fixture) | 2,922 | 516 | 3,954 | city, in zone | 100 commits, 32 people | metropolis |
| microsoft/vscode (fixture capped, est. ~10k files) | 10k+ | 2k+ | 14k+ | metropolis | | metropolis |
| vercel/next.js (est.) | ~20k | ~6k | ~32k | metropolis | | metropolis |
| torvalds/linux | tree truncated by GitHub | | floor | metropolis | | metropolis |

Legacy fixtures: `scripts/migrate-fixtures.ts` (S0) writes `settlement` into every `fixtures/*.analysis.json`. For fixtures whose warnings include the tree-cap or truncation line (vscode), it sets `lowerBound: true` and raises the footprint to at least 10,000. The generator never classifies. It reads the field or defaults to `"city"`.

`reason` examples:
- "18 files in 1 folder make a village. It is busy, but a village stays a village until it has 40 files and folders."
- "2,922 files in 516 folders make a city. 100 commits from 32 people in the last 90 days raise it to a metropolis."

## 76.5 Per-tier layout and scale

`lib/city/settlement.ts` holds one `SETTLEMENT_PARAMS: Record<SettlementTier, SettlementParams>` table. The generator, the layout and the renderer all read their constants from it. City values are exactly today's constants, so a city-tier repository renders byte-identically.

| Parameter | village | town | city (today) | metropolis |
|---|---|---|---|---|
| layout | organic lanes (`lib/city/village.ts`) | grid | grid | grid |
| buildings, min to max (server `selectBuildings`) | 6 to 40 | 30 to 120 | 75 to 300 | 300 to 450 |
| tier heights 1..5 | 3.4, 4.2, 5.2, 6.4, 7.6 | 3.8, 5.4, 7.6, 10.5, 14 | 4.2, 7, 11, 16, 23 | 5, 8.5, 14, 22, 34 |
| tier shares 5/4/3/2/1 | 0.02/0.05/0.13/0.3/0.5 | 0.03/0.08/0.14/0.3/0.45 | 0.05/0.1/0.15/0.25/0.45 | 0.08/0.14/0.2/0.26/0.32 |
| footprint min to max | 3 to 5.2 | 3.6 to 7 | 4 to 8.5 | 4.5 to 10 |
| road widths | main 5, lane 3.6 (`kind: "lane"`) | major 6, minor 4.2 | 7, 4.5 | avenue 9.5 (`kind: "avenue"`), minor 5.5 |
| block side, slot pitch | lane pitch 7 | 19, 6.6 | 22, 7.2 | 27, 8.6 |
| district square side | n/a | 36 + 6.6·√n, clamped 70 to 125 | 40 + 7.2·√n, clamped 115 to 175 | 48 + 8.8·√n, clamped 215 to 270 |
| landmark band | none, plots along the main street | 10 to 14 | 12 to 20 | 20 to 26 |
| ring road | none (loop round the green) | street | street | highway, width 10 |
| highways out | the main street runs out of the village, 0 to 2 | 0 to 2 | 0 to 4 | at least 2, up to 4 |
| bounds.size | 80 to 125 | 115 to 165 | 170 to 230 | 285 to 320 |
| hero incidents / hero sites | 6 / 3 | 9 / 5 | 12 / 8 | 16 / 10 |
| moving vehicles cap | 10 (tractors allowed) | 24 | 40 | 64 |
| trees / lamps | 160 / 30 | 100 / 90 | 100 / 120 | 120 / 160 |

On the server, `selectBuildings` takes `{ min, max }`. `min` replaces `MIN_CANDIDATES` as the "keep the finer granularity" floor. `max` replaces `MAX_BUILDINGS` (now 450 as the absolute cap). `tierForRank` takes the settlement's share table. `analyzeSnapshot` is reordered so it computes metrics, then classifies, then selects buildings.

### Village (`lib/city/village.ts`, returns a `CityLayout`)

The layout stays a pure function of the district list and counts. It reads no PRNG. Bends come from `hash32(district.id)`, as section 35 requires.

1. The village green sits at the origin: square side `clamp(16 + 0.5n, 16, 26)`, with chamfered corners. It becomes `layout.civic.rect`, and the chapel (the civic landmark) stands on its north edge. The root landmark files (README, manifest and so on) stand round the green facing it. `CityModel.plaza.surface` is `"green"`.
2. A lane loops the green in eight segments.
3. The main street runs along the green's south side and out east and west in two or three segments per side. Each bend is 8 to 18 degrees, and the half-length is `clamp(24 + 1.6n, 30, 55)`. It carries `major: true`, width 5.
4. Each district gets one lane. The lane leaves the loop or the main street and heads outward in a compass sector (sectors go to districts in weight order, with ±20 degrees of jitter). It has two or three segments with bends, is `kind: "lane"`, width 3.6, and ends in a dead end. Its length is `3.5 × houses + 8`.
5. Houses sit along both sides of each lane at pitch 7. Cells are squares of side 6, set back `lane.width/2 + KERB + 3`. A house faces its lane (`rotationY` = lane heading ± π/2) and its footprint is at most `cell/√2`, so it fits its cell at any rotation. A cell is rejected if it comes within road clearance of any segment (exact `distanceToRoad`) or overlaps another cell (a uniform grid check). The next pitch position is tried instead.
6. Landmark plots, 9 to 12 units, are reserved first along the main street. Fire and info go beside the green. The power substation goes at the east end and the station halt at the west end, next to the road out.
7. Fields (`props.fields`): 6 to 14 rectangles, 10 to 22 units, fill the ring between the houses and the bounds. Each is oriented along its nearest lane and has hedgerow trees on its edges.
8. District rects are the bounding boxes of each lane's house cells, used for labels and focus. `bounds.size = 2 × max extent + 10`, clamped to 80 to 125.

The renderer already handles angled roads: `groundwork.ts` `roadLays` derives `angle` from `atan2`. S7 draws `lane` without pavements or crossings, and puts a joint disc at degree-2 nodes so bends have no wedge gaps. Traffic handles dead ends with U-turns already (`traffic.ts`).

### Town

The town uses today's `planLayout` with the town parameters. The east-west major roads along the civic square's south edge, continued to the ring, get `main: true` (the high street). Slots whose cell edge is within `KERB + 1` of a main road get `frontage: "main-street"`. The generator copies that onto `Building.frontage`, and S6 puts shopfronts there. `plaza.surface` is `"setts"`.

### Metropolis

The metropolis uses today's `planLayout` with metropolis parameters. Treemap seams become `kind: "avenue"`, drawn as a dual carriageway with a planted median. Ring segments become `kind: "highway"`, width 10. `planHighways` returns at least two highways. The 300-building floor on the server keeps the plate full.

### Scale checks at both ends

| Quantity (file) | Village 90 | City 226 | Metropolis 320 | Action |
|---|---|---|---|---|
| overview distance `1.45·size·widen` (`entities.ts overviewFraming`) | 130 | 328 | 464, 974 on a phone | ok |
| `maxCameraDistance = max(160, 1.9·size)·widen` | 160 | 429 | 608, 1,277 on a phone | ok |
| camera `far: 2000` (`CityCanvas.tsx`) | ok | ok | phone camera 974 plus landscape radius 512·√2 ≈ 1,700, which is close to the limit | S7: `far = max(2000, 7·size)` |
| sky dome radius cap 1,400 (`Environment.tsx`) | 700 | 904 | 1,280; a phone camera at 974 is inside it, but only just | S7: radius `max(1400, 1.3·maxCameraDistance)` |
| fog `2.9 / 4.4 × size·widen` (`palette.ts`, `City.tsx`) | 261 / 396 | ok | 928 / 1,408 | ok |
| shadow texel `2·reach / 2048` (`Lighting.tsx`) | 0.05 | 0.14 to 0.19 | 0.19 to 0.26 (low tier 0.39 to 0.53) | S7 measures. Options are 4096 on the high tier for metropolis only, or fitting the shadow camera to the view. Decide with S9 numbers |
| `cameraBoundary` ceiling 24 | ok | ok | tallest tower is 34 × 1.15 ≈ 39, aimed at 55% = 21.5 | S5: ceiling `max(24, 0.6 × tallest)` |
| terrain `3.2·size`, textures tiled per world unit | ok | ok | 1,024 wide, same texel density | ok |
| district label scale `0.72·size` | labels large against cottages | ok | ok | S6 checks in `District.tsx` |
| inspection distance clamp 140 | ok | ok | 34-unit tower gives 93 | ok |

### Orchestrator rulings after S0 (2026-09-22)

- The city tier stays byte-identical to today, and that beats the city bounds band. `SETTLEMENT_PARAMS.city` keeps today's constants: a district side clamped 56 to 170, and bounds that fall out of today's layout. Size-band tests apply to village, town and metropolis only. Town parameters must keep a typical town smaller than a typical city: a city-tier repository has a footprint of at least 600, and at least 75 buildings.
- Capped fixture trees floor their footprint at the surveyed files, plus 2 × dirs, plus the capped and deep counts from the warnings (`SettlementInput.footprintFloor`). That keeps turborepo a city and makes vscode a metropolis.
- Dev loop: type `backlog` in the repository box (dev only) to load `fixtures/backlog.analysis.json`, a metropolis with 984 crowd issues and 490 crowd PRs. `?tier=village|town|city|metropolis` forces the tier for any repository (dev only).

## 76.6 Ingestion design (S1)

Survey start is T0, the moment `fetchSnapshot` begins. Metadata comes first, as today, and yields `open_issues_count` (issues plus PRs) and `x-ratelimit-remaining`.

Wave A fires in parallel with the tree, CI and activity requests:

- A1, the health sample: `/issues?state=open&sort=comments&direction=desc&per_page=100`. This is today's request 4, unchanged. It becomes `snapshot.issues`.
- A2, bulk issue pages: `/issues?state=open&sort=updated&direction=desc&per_page=100&page=p` for p = 1..K, where K = `min(12, ceil(open_issues_count / 100))`. They are skipped when `open_issues_count <= 100`, because A1 already holds everything. Twelve pages rather than ten, because PR items share these pages.
- A3, open PRs page 1: `/pulls?state=open&sort=updated&direction=desc&per_page=100`. This replaces today's `per_page=50`. The health sample is the first 50 of these by `updatedAt`, which is exactly the set the old request returned.
- A4, closed PRs: unchanged request 6.
- A5, totals: GraphQL `repository { issues(states: OPEN) { totalCount } pullRequests(states: OPEN) { totalCount } }`. It costs 1 point and needs the token. Fallback: `/pulls?state=open&per_page=1` and read `rel="last"` from `Link` to get the PR count. Issues are then `open_issues_count − PRs`, with `exact: false` if even that fails.

Wave A' fires when A5 lands. With the real split known, if 1,000 issues need more pages than K (a PR-heavy repository), it fires top-up pages up to 15 in total.

Wave B fires after A3: pull pages 2..`min(5, lastPage)`, in parallel.

Wave C, enrichment (token only), fires after all open PRs are known. It sends batches of 50 PR numbers as aliased GraphQL queries (`p123: pullRequest(number: 123) { reviewDecision comments { totalCount } reactions { totalCount } changedFiles files(first: 8) { nodes { path } } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }`). All batches run in parallel, at most 10. REST cannot give touched files for 500 PRs without 500 requests. This is what puts a scaffold on the actual file a PR changes.

Separating issues from PRs: `mapIssue` still drops items with `pull_request`. PR items from the `/issues` pages are no longer thrown away. Their `comments` and `reactions.total_count` fill in `PullSummary.comments` and `reactions` when GraphQL did not run. That fixes the gap noted in `mapPull`, where the list endpoint has no `comments`. Everything is deduped by number. `issueBacklog` never repeats an A1 issue.

New client pieces:
- `GitHubClient.getPage<T>(path, options) → { items: T[]; lastPage: number | null }`, which parses `Link`.
- `RequestOptions.signal`, merged into `fetchRaw` so a page can be abandoned without aborting the whole survey.
- `client.graphql<T>(query, variables)`, a POST to `/graphql` that reads `x-ratelimit-remaining` in points.
- `lib/github/paginate.ts` `fetchPages(client, path, query, pages, deadline)`, which returns the items from the settled pages plus received and failed counts.

Budgets:
- The page deadline is T0 + 22 s and the enrichment deadline is T0 + 30 s. Both are `AbortSignal.timeout`s merged with the route's signal. The route keeps `SURVEY_BUDGET_MS = 45_000` and `maxDuration = 60`. The tree, which is fatal, never waits on pagination.
- Rate guard. If REST remaining is below 400 after metadata, there are no bulk pages and only PR page 1. If GraphQL remaining is below 300 points, enrichment is skipped. Either case adds a warning such as "GitHub's request budget is low right now, so only the first 100 issues are drawn."
- Request count per uncached analysis is at most about 35 REST requests (today's 15, plus up to 15 issue pages and 4 PR pages, plus the Link fallback) and at most 7 GraphQL queries. Small repositories are unchanged. Section 30's 10 to 20 target still holds for anything with 100 or fewer open issues.

Partial results: a page lost to the deadline, an error or the rate guard is recorded in `coverage` and is never fatal. The stage stays `done`, with a factual detail such as "700 of 21,011 open issues surveyed (time limit)". While pages land, the `issues` and `pulls` stages emit repeated `running` events with rising counts. The store keys stages by id, so the row updates in place.

Caching: the in-memory `lib/cache.ts` entry grows to about 0.5 to 0.9 MB for giants. `MAX_ENTRIES` drops from 50 to 30. Every page request keeps `cache: "force-cache"` and `next: { revalidate: 600 }`. According to `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/fetch.md`, `force-cache` caches POST too, so identical GraphQL batches dedupe across instances for 10 minutes. Fixture fallback analyses have no backlog, so their overflow is estimated from `repo.openIssuesCount` and marked "about".

Payload: the server truncates backlog titles to 140 characters, labels to 4 × 32, and files to 5, and drops bodies and URLs. Estimate: 1,000 issues × about 260 bytes plus 500 PRs × about 380 bytes ≈ 450 KB, on top of today's 100 to 200 KB. Section 34's 300 KB target becomes "300 KB plus the backlog, hard ceiling 1 MB", enforced by a test on the maximal synthetic analysis.

Health invariance: `computeHealth` and `computeConfidence` read only `snapshot.issues` (A1) and the first 50 open PRs by `updatedAt`. `metrics.issues.open` and `metrics.pulls.open` keep their sample meaning. The new `total` fields carry the real counts to the HUD.

## 76.7 Mapping issues and PRs to kinds (S2, `lib/analysis/forms.ts`)

Severity stays with the existing rules: `classifyIssue` gives `major`, `collision`, `stale` or `minor`, and `classifyPull` gives `active`, `slow`, `abandoned` or `completed`. The form is new and decides the shape. First match wins. `labels` is the lower-cased joined label text. `idle` is days since `updatedAt`.

Issue form:
1. `fire`: state `major`, or labels match `/security|vulnerab|cve/`, or (bug and severe label and (comments >= 5 or reactions >= 10)).
2. `wreck`: state `stale`, or `idle >= 365`. The car was abandoned.
3. `collision`: state `collision`.
4. `roadblock`: `/blocked|on[- ]?hold|waiting|awaiting|needs[- ]?(info|repro|reproduction|feedback|triage)|triage|question/`.
5. `signpost`: `/doc|typo|readme|website|example/`.
6. `survey`: `/enhancement|feature|proposal|rfc|idea|suggestion|request/`.
7. `pothole`: everything else, including "good first issue" and "help wanted". Those two carry a volunteer flag in the inspector copy.

PR form:
1. `van` (utility works): the author matches `/\[bot\]$|^dependabot|^renovate/`, or labels match `/dependenc|deps|bump|renovate|dependabot/`.
2. `hoarding` (a fenced empty plot): `draft`.
3. `trench` (road dug up): labels match `/\bci\b|build|infra|tooling|chore|refactor|perf|workflow|actions/`, or more than half the touched files are under `.github/`, build scripts or config files.
4. `scaffold` (on the building the change touches): every other open PR.
5. `site` (the crane): heroes only, never in the backlog.

PR modifiers are drawn per instance and written into the inspector:
- `checks: "failing"` adds a red alarm beacon: "Its checks are failing."
- `review: "changes-requested"` adds a red stop board.
- `review: "approved"` adds a green flag.
- `abandoned` gives a rust tint and no worker. `slow` is dimmed.

Heat: `heat = clamp(log2(1 + comments + 2·reactions) / 7, 0, 1)`. Instance scale is `0.9 + 0.35·heat`, and heat also sets beacon brightness.

`relatedPath`:
- Issues: the existing `relatedPathFor`, run server side over title and body for all 1,000 issues. The body is then dropped.
- PRs: the deepest directory holding the majority of the touched files. Otherwise the title path token. Otherwise `null`.

Heroes: `metrics.issues.ranked` keeps today's ranking over the A1 sample, sliced to 16. The generator slices it per tier, so a city keeps exactly today's 12. Open PR heroes keep `classifyPull`'s score, sliced to 8 open plus 2 merged. Heroes are removed from the backlog.

Backlog: everything else, up to 1,000 issues in total and 500 PRs in total, heroes included. Items are chosen by recency of update ("most active first") and then ordered by significance score. That order decides who gets the spots nearest their code.

## 76.8 Placement at scale (S4)

New `lib/city/spots.ts` builds a `SpotIndex` once per city. There are four spot classes, all deterministic, with a uniform 16-unit grid for nearest-free queries:

1. Kerb spots. On every street, lane and avenue segment, excluding highways, both sides. The lateral offset is `width/2 + SIDEWALK_WIDTH/2` (on the pavement). The pitch along the road is 3.2, and the first and last 3.5 units of each segment are skipped (junction reach and crossings). Spots within 1.4 of a lamp are skipped, so lamps are placed before the crowd.
2. Lane spots. At `laneOffset(width)` on the same segments, for lane-intruding forms.
3. Ground spots. A 3.5-pitch grid over unclaimed district slots, the green, fields and landmark-band corners. Wrecks, survey pegs and hoardings can stand here. Hoardings prefer whole vacant slots, because a draft PR is a fenced empty plot.
4. Facades. For each building, the face whose outward normal points at the nearest road carries at most one scaffold.

Algorithm, seeded with `prngFor(seed, "backlog")` so no existing stream moves:
1. Reserve the hero incidents (today's `findRoadSpot`, unchanged), hero site plots, landmark plots and lamps. Spots within 7 units of a hero are marked taken.
2. Anchor each backlog item. An item with a `relatedPath` anchors to the building with the longest path prefix. Failing that, it anchors to its district's rect centre (`districtForPath`, then `districtForText`). Failing that, it has no anchor.
3. In significance order, an anchored item takes the nearest free spot of an allowed class within 40 units. An unanchored item takes the next spot in a seeded stride through a shuffled global list, which spreads it evenly.
4. Scaffolds go to the host building's facade. If that facade is taken, they go to the next building in the same district by distance. Scaffolds are capped at 35% of buildings. Past the cap a scaffold becomes a trench beside the host.
5. Lane budget. At most one lane-intruding crowd object per segment. None on bridge segments of the street graph (Tarjan, computed once), so no crowd object ever cuts off part of the network. None on highways. At most 25% of street segments may carry any lane blocker, hero or crowd. Anything over the budget goes to the kerb with `lane: false`.
6. An item that finds no spot counts as hidden in the overflow.

Rough capacity: a village about 400 spots, a town about 700, a city about 1,300, a metropolis about 2,500. So a village with 1,000 open issues honestly shows about 400 of them and queues the rest.

Overflow (`lib/city/overflow.ts`):
- `hidden = total − drawn` for each of issues and PRs. `total` comes from `metrics.*.total`, or from `repo.openIssuesCount` with `exact: false`.
- The queue has `Q = clamp(round(8·log10(hidden + 1)), 4, 60)` cars at 5.2-unit spacing on the inbound lane of each highway, starting just outside the ring. With no highway, the queue goes on the main road out (village) or the outer ring segment nearest the sign.
- The signboard stands on the verge beside the first queue, with plot `[6, 5, 1]` and id `"overflow"`.
- If nothing is hidden, `overflow` is `null`.

Reveal: the backlog appears between 2,700 and 3,900 ms, ordered by distance from the centre, so it ripples outward (section 43, amended).

Performance target: `generateCity` for the maximal metropolis in at most 120 ms on the reference desktop.

## 76.9 Rendering (S5, with forms art by S5, S6 and S7 as owned)

| Budget | village | town | city | metropolis |
|---|---|---|---|---|
| hero incidents (about 12 draw calls each) | 6 | 9 | 12 | 16 |
| hero sites (about 6 draw calls each) | 3 | 5 | 8 | 10 |
| crowd objects | every placed backlog item, at most 1,500 minus heroes | | | |
| crowd draw calls | about 22 whatever the count: 7 issue forms, 4 PR forms, beacons, flames, smoke, review flags, up to 6 queue body types, 1 sign | | | |
| crowd triangles | at most 160 per issue form, 220 per scaffold, total at most 250k | | | |
| buildings | 40 | 120 | 300 | 450 |

Crowd layer (`components/city/backlog/**`):
- One `InstancedMesh` per form, built from merged geometry in the same style as `incidentDecor.ts` and `constructionDecor.ts`. The queue reuses `parkedGeometry` from `models/vehicles/shapes.ts`.
- `castShadow = false`, `receiveShadow = true`.
- Per-instance colour carries state tint, age rust and hover or selection tint, as `Buildings.tsx` does.
- Animation lives in the shader. Flames, beacons and smoke bob get an `instancePhase` attribute and a single `uTime` uniform set once per frame. There is no per-instance CPU work after the reveal settles. `prefers-reduced-motion` freezes `uTime`.
- The low quality tier drops smoke and beacon halos (a new `crowdEffects` flag in `quality.ts`). It never drops a crowd object.

Picking: each crowd mesh gets a custom `raycast` in `components/city/backlog/pick.ts`. A `Float32Array` holds `[x, z, cos, sin, hx, hy, hz]` per instance. The ray goes into each instance's frame for a slab test against its `size`. The function writes `{ distance, point, object, instanceId }` exactly as three's `InstancedMesh.raycast` does, so R3F sorts by distance and `useInstanceHandlers(ids)` maps `instanceId` to the entity id. There are no geometry triangle tests, and 1,500 instances cost tens of microseconds per pointer move. A scaffold's pick box covers only its facade slab, 0.9 deep, so the building's other faces and roof still select the building.

Inspector path. S0 adds `lib/city/entityIndex.ts` with `indexEntities(city)`, a `WeakMap`-memoised `Map<string, SelectableEntity>` over buildings, landmarks, heroes, backlog and overflow.
- `resolveEntity` (S8) and `focusTargetFor` / `SelectionRing` (S5) use it.
- Crowd entities reuse the incident and construction branches, with new facts: form, reactions, CI, review, touched files as links, and "Near" (the related path).
- The overflow gets its own branch. Its label is "QUEUE AT THE CITY LIMITS", and its facts are open, drawn and queued totals for issues and PRs. It says "about" when not exact, and links to `${repo.url}/issues` and `/pulls`.
- Street-level focus (`STREET_POLAR`) applies to crowd objects because their kinds are still `incident` and `construction`.

Blockages and traffic:
- `cityObstacles` takes heroes, crowd items with `lane: true` (footprints come from a `CROWD_FOOTPRINT` table held to the decor bounding boxes by a test, as `INCIDENT_FOOTPRINT` is) and the overflow queue.
- `blockedStretches` bins segments into a 16-unit grid and tests each obstacle only against the segments in the cells it overlaps. A test proves the result identical to the brute-force loop.
- `MAX_CARS` becomes the tier's vehicle cap, up to 64.
- `revealEnd` and the quality probe's settle time include the backlog.
- `streetFurniture.ts` `blockersOf` adds crowd items, so benches and parked cars never sit on top of a pothole.

## 76.10 HUD and copy (S8, with copy in S4)

- The identity block (`CityHUD.tsx`) gets one line under the repository link, in the style of the existing "Archived repository" line: "Town of zustand". Hovering it gives `settlement.reason`.
- The final stage reads "Town constructed" instead of "City constructed".
- A chip reads "1,000 of 21,011 issues on the streets" when anything is queued.
- The civic landmark title follows the tier: "VILLAGE CHAPEL", "TOWN HALL", "CITY HALL", "CITY HALL". The copy lives in `lib/city/entities.ts` `planLandmarks` (S4). The label map moves off `LandmarkType` to the landmark's own title (S8).
- `Legend.tsx` lists the seven issue forms, the four crowd PR forms and the queue.
- Crowd inspector copy comes from `lib/city/entities.ts` (S4). There is one rule sentence per form and state, for example "An open question waiting on its author: the road is closed until someone answers." It is generated, never free-form (section 12).

## 76.11 Workstreams

S0 is serial and lands first. It takes about half a day of one agent.
- It adds every type in 76.3 exactly.
- It writes `lib/analysis/settlement.ts` with tests, `lib/city/settlement.ts` (the params table, with city values equal to today's constants, and `settlementName()`), and `lib/city/entityIndex.ts`.
- The generator reads `analysis.settlement?.tier ?? "city"`, sets `CityModel.settlement`, and passes `{ tier }` to `planLayout`, which ignores it until S3.
- It adds the new `ArchetypeId`s mapped to the nearest existing geometry as placeholders: cottage, farmhouse, barn, shopfront, terrace, apartment-low, tower-glass, tower-twin, tower-spire.
- It adds stub components that return null, `backlog/Backlog.tsx`, `Overflow.tsx` and `Fields.tsx`, already mounted in `City.tsx`.
- It writes `scripts/migrate-fixtures.ts` and runs it.
- It writes `scripts/make-backlog-fixture.ts`, which produces `fixtures/backlog.analysis.json`: the react fixture plus 984 synthetic backlog issues and 490 PRs, forms assigned round-robin, tier metropolis.
- It adds a dev-only `?tier=` override in the store.
- `pnpm typecheck && pnpm lint && pnpm test && pnpm build` pass with 906+ tests and no visual change.

Then nine parallel agents in isolated worktrees, disjoint ownership:

| Agent | Owns | Goal |
|---|---|---|
| S1 Ingestion | `lib/github/**`, `types/github.ts`, `app/api/analyze/route.ts`, `lib/cache.ts`, `lib/ratelimit.ts`, `scripts/snapshot.ts` | 76.6: uncapped tree counts, parallel pages, totals, GraphQL enrichment, deadlines, rate guard, coverage, progress lines |
| S2 Interpretation | `lib/analysis/**` (settlement.ts after S0), new `forms.ts`, `backlog.ts`, `scripts/migrate-fixtures.ts` | classification tuning, per-tier building budgets and shares, forms, heat, relatedPath for PRs, compact backlog, health invariance, payload ceiling |
| S3 Layout | `lib/city/layout.ts`, new `lib/city/village.ts`, `lib/city/settlement.ts` (after S0), `scripts/city-stats.ts` | per-tier grid parameters, the organic village, town high street and frontage, metropolis avenues, highway ring and highways, `plaza`, `fields` |
| S4 Population | `lib/city/generator.ts`, new `lib/city/spots.ts`, `lib/city/backlog.ts`, `lib/city/overflow.ts`, `lib/city/entities.ts` | 76.8: tiered heights, footprints and limits, hero slicing per tier, spot index, crowd placement, scaffold hosts, lane budget and bridges, overflow and queue, copy |
| S5 Crowd and traffic | `components/city/backlog/**`, `Overflow.tsx`, `City.tsx`, `blockages.ts`, `traffic.ts`, `Traffic.tsx`, `entities.ts`, `SelectionRing.tsx`, `useEntity.ts`, `reveal.ts`, `useReveal.ts`, `IssueIncident.tsx`, `ConstructionSite.tsx`, `models/props/{incidentDecor,constructionDecor,streetFurniture}.ts`, new `fixtures/dev.backlog.ts` | 76.9: instanced forms, shader animation, picking, overflow sign and queue, blockage grid, vehicle caps, camera ceiling |
| S6 Village and town art | `components/city/models/buildings/**` except `metropolis.ts`, `Buildings.tsx`, `Building.tsx`, `District.tsx`, `Fields.tsx`, `Landmark.tsx`, `models/landmarks/**`, `models/vehicles/shapes.ts`, `models/props/trees.ts` | cottage, farmhouse, barn, shopfront, terrace and low apartment models; per-settlement archetype tables (metropolis ids included); lane-facing yaw in the village instead of `doorTurn`; chapel; landmarks scaled for a village; fields and hedgerows; tractor; village district labels without ground tint |
| S7 Metropolis, roads and scale | `models/buildings/metropolis.ts`, `Roads.tsx`, `groundwork.ts`, `textures/**`, `Terrain.tsx`, `Lighting.tsx`, `Environment.tsx`, `CityCanvas.tsx`, `palette.ts`, `effects.tsx`, `Props.tsx`, `Pedestrians.tsx` | glass, twin and spire towers; lane, avenue and highway-ring surfaces and bend joints; plaza surface per tier; camera far, sky dome, shadow fit and pedestrian density per tier (76.5 table) |
| S8 HUD and inspector | `components/*.tsx` except `CityCanvas.tsx`, `lib/client/**`, `store/useCityStore.ts`, `app/page.tsx` | settlement line and hover, queue chip, crowd and overflow inspector facts, legend, stage copy, entity index in `resolveEntity` |
| S9 Performance | `components/city/quality.ts`, new `components/city/perf/**` (a dev `?perf=1` overlay with fps, frame p95, draw calls, triangles), `scripts/make-stress-fixture.ts`, `fixtures/stress.analysis.json`, perf tests | builds the harness in parallel, then runs the serial tuning pass after all merges (below) |

Rules from section 72 still apply. Agents work only inside owned paths, report any cross-boundary change instead of making it, and never edit `types/**` after S0 (propose additions in the report). Tests are required for all pure logic, typecheck, lint and test pass before reporting, and every renderer agent screenshots all four tiers before and after.

Until S4 lands, renderer agents work from `?tier=` plus `fixtures/backlog.analysis.json`, and S5 uses its own `fixtures/dev.backlog.ts` (the `?dev=city` pattern).

## 76.12 Merge order

1. S0.
2. S3. Tiers become physically visible at once.
3. S2, then S1. The server produces settlement, backlog and totals. Nothing is drawn yet, so this is safe.
4. S6, then S7. The tiers get their own look.
5. S4. `city.backlog` and `overflow` are populated, still undrawn.
6. S5, rebased on S4 and checked against real placement. Everything is drawn.
7. S8.
8. S9 tuning pass (serial). The orchestrator grants temporary write access to renderer files. Any budget change goes back into `lib/city/settlement.ts` and 76.9.
9. Integration step I:
   - re-capture `fixtures/react__react.analysis.json` and `microsoft__vscode.analysis.json` with the new server, replacing the estimates in 76.4;
   - run section 59's reference set plus zustand, express and next.js;
   - screenshot one repository per tier;
   - deploy and verify on the hosted URL.

After each merge: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`, plus the four-tier screenshots.

## 76.13 Performance gate

The existing gate stays: 60 fps on the 300-building city.

New, measured with the `?perf=1` overlay on `fixtures/stress.analysis.json`. That fixture is a metropolis with 450 buildings, 16 hero incidents, 10 hero sites, 984 crowd issues, 490 crowd PRs, 64 cars and a 60-car queue.

| Check | Target |
|---|---|
| Median fps, discrete GPU, 1920×1080, high tier | at least 60 |
| Frame time p95 on the same machine | at most 20 ms |
| Integrated GPU (M1 or Iris Xe class), after the automatic step-down | at least 30 fps |
| `renderer.info.render.calls` | at most 450 |
| Triangles, shadow pass included | at most 1.2 M |
| Pointer-move raycast over all crowd meshes (Vitest micro-benchmark) | at most 1 ms |
| `generateCity(stress)` | at most 120 ms on desktop; CI bound 600 ms |
| `blockedStretches(stress)` | at most 30 ms |
| `/api/analyze` microsoft/vscode, uncached | at most 30 s, at most 1 MB, at most 35 REST and 7 GraphQL requests |
| village, town and city fixtures | no fps regression against today |

If the gate fails, fix it in section 63's order: effects first, then crowd effects, shadows, pedestrians, trees and cars. Heroes and crowd objects are incidents, and incidents are never cut.

## 76.14 Test plan

- Classification (S0, S2): a table test over the 76.4 rows, using fixture numbers where they exist. Promotion boundaries. An archived repository is never promoted. GitHub truncation gives metropolis. The migration sets `lowerBound` on the capped vscode fixture.
- Ingestion (S1, mocked fetch):
  - `Link` parsing;
  - page planning from `open_issues_count` and the top-up after totals;
  - PR items dropped from the issue list but used to enrich PR comments and reactions;
  - dedupe against A1;
  - the deadline yields a partial snapshot with correct `coverage`;
  - the rate guard trims pages;
  - a GraphQL failure leaves `review`, `checks` and `files` null without failing the survey;
  - a small repository makes exactly today's requests.
- Health invariance (S2): `analyzeSnapshot` on `mid.snapshot.ts` and `archived.snapshot.ts`, with and without a large `issueBacklog` and 500 PRs, gives identical `health` and `confidence`.
- Interpretation (S2): form rule tables, first-match order, heat, PR `relatedPath` from touched files, backlog ceilings, heroes excluded, and a payload of at most 1 MB on the maximal synthetic snapshot.
- Layout (S3):
  - every tier's `bounds.size` falls in its band;
  - city output is byte-identical to today's for every fixture;
  - the village: no cell on a road, no overlapping cells, every house faces a lane, the graph is connected, same inputs give the same layout;
  - town frontage slots touch a `main` road;
  - metropolis rings are highways.
- Population (S4):
  - byte-identical output over two runs;
  - `drawn + hidden = total` for issues and for PRs;
  - no crowd object overlaps a building, a landmark plot or another crowd object;
  - lane blockers stay within budget and off bridges;
  - scaffolds are capped at 35% and sit on the host facade;
  - hero incidents for a city-tier fixture are unchanged.
- Renderer pure modules (S5): `pick.ts` against three's own raycast on sample instances; `instanceId` to id mapping; the grid blockages equal the brute-force result; `CROWD_FOOTPRINT` covers each form's decor bounding box; queue obstacles close the lane.
- HUD and inspector (S8): `settlementName` per tier; crowd and overflow facts format numbers with `toLocaleString`; "about" appears when totals are not exact.
- Perf (S9): the micro-benchmarks above run in Vitest with generous CI bounds.

## 76.15 Risks

- Classification is calibrated on estimates. Zustand, express, next.js and the uncapped vscode count need live numbers (step I). The thresholds sit in one table so that tuning them touches no other code.
- GraphQL enrichment of 500 PRs, with `statusCheckRollup` and `files`, may be slow on huge repositories, or may trip GitHub's secondary limits at 10 parallel queries. The deadline makes it partial, never fatal. If it misbehaves, drop the batch concurrency to 4.
- A village with hundreds of issues cannot show them all. The queue and the reason copy have to make that read as a fact about the repository, not as a bug.
- Organic village lanes are the first angled roads in the city. Pavement joints, crossing logic in `groundwork.ts`, AABB-based checks such as `clearHalfExtent` and `roadFootprint` (conservative for diagonals), and `doorTurn` all assume axis-aligned streets. S3 and S7 must test the angled cases explicitly.
- Crowd objects on pavements share space with pedestrians (`Pedestrians.tsx`). If people visibly walk through wrecks, S5 adds crowd items to the pedestrian blockers.
- At metropolis size the one-map shadow gets blurrier. Moving to a 4096 map costs GPU memory and fill rate, so S9 decides with numbers.
- Cached and fixture analyses from before this feature render as city-tier with no backlog, and their overflow counts are estimates. That is correct behaviour, but the demo fixtures must be re-captured before voting.
- A payload near 1 MB is one NDJSON line. Parsing costs about 10 ms. Hosting and proxy limits on streamed response size were not tested.
