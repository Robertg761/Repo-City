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

Maintain a simple note during development listing every significant AI model used.

Example:

```text
AI used during development:
- GPT-5.6 Sol
- Codex
- Claude ...
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

---

# 30. Request budget

Avoid making hundreds of GitHub API requests.

Target roughly:

**10 to 20 requests per uncached analysis**

Use bulk/tree endpoints wherever possible.

Cache repository analysis temporarily.

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

Small provider adapter.

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

/lib
  /github
    client.ts
    repository.ts
    tree.ts
    issues.ts
    pulls.ts
    workflows.ts
    activity.ts

  /analysis
    metrics.ts
    scoring.ts
    fileSelection.ts

  /ai
    analyze.ts
    schema.ts

  /city
    generator.ts
    layout.ts
    seed.ts

/types
  github.ts
  repository.ts
  analysis.ts
  city.ts
```

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
```

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

Hardcoded:

```text
Health: 72
Issues: 5
Pull Requests: 3
CI: passing
```

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

Check exact final character count before submission.

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

---

# 60. Invalid input

### Invalid GitHub URL

```text
That doesn't look like a GitHub repository.
```

### Missing repository

```text
Repository not found.
```

### Private repo

```text
Repo City currently supports public repositories.
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
* [ ] git history checked for secrets

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
