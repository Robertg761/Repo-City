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
* tap = select

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
* mild fog
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
export interface RankedPull extends PullSummary { score: number; state: ConstructionState; reason: string }

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
5. Confirm the Vercel account and project name to deploy to. The Vercel CLI is not installed locally.
