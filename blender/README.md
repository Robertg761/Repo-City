# Blender models

The city's models, written as Blender Python scripts. They are what the city
draws by default; `?models=procedural` switches back to the procedural
TypeScript builders they replaced (for comparison), and the app falls back to
those by itself if the model data cannot load. Tests run in node and see the
procedural builders unless they mock `BLENDER_MODELS`; every Blender variant
has tests of its own.

## The pipeline

```
blender/<area>/<model>.py      build() -> the objects to export
        | blender -b --python blender/export.py -- blender/<area>/<model>.py <name>
assets/models/<name>.glb       the source of truth, uncompressed
        | node scripts/import-model.ts assets/models/<name>.glb components/city/models/<area>/<camelName>.model.ts
components/city/models/<area>/<camelName>.model.ts   generated, never edited by hand
        | importedParts / importedSlots / importedMarkers   (components/city/models/imported.ts)
the model's TypeScript builder, switched by BLENDER_MODELS   (components/city/models/modelSource.ts)
```

Preview and compare without the app:

```
blender -b --python blender/stage.py -- blender/out/<area>/<prefix> blender/<area>/<model>.py [other.py | other.ply | model.py@N]
```

`stage.py` lays the sources out side by side, prints `TRIANGLES <source> <n>`
per source, and renders `-front34`, `-rear34`, `-side` and `-city` PNGs.
`model.py@N` calls the script's `preview(N)` for a variant. To render the
procedural counterpart, export it to PLY (see `blender/export-procedural.test.ts`,
run with `EXPORT_PLY=1`).

## Conventions

- **Coordinates:** `blender/kit.py` takes the APP's frame everywhere (x across,
  y up, z forward, ground y = 0) and converts to Blender itself, so numbers are
  copied straight from the TypeScript specs. Match the procedural model's
  footprint, pivots and anchor points exactly; tests should prove it.
- **Materials** are named `<role>.<surface>[.tNN]`:
  - `surface` is a key of `SURFACE` (`components/city/textures/surface-types.ts`);
  - `tNN` is a darker shade of the role (t80 = 80%), baked into the vertex colour;
  - a role starting with `paint` is paintwork that an instance colour paints
    (`Part.paint`), for tinted instanced models like the fleet;
  - landmarks use the role as the colour SLOT the renderer paints from the
    city palette (see `fire_station.py` and `FireStation` in `Landmark.tsx`).
- **Ambient occlusion** is baked into the `AO` colour attribute by
  `kit.bake_ao`. Keep `floor` around 0.55 for things that stand among
  unoccluded procedural neighbours, or they read as dirty.
- **Markers:** `kit.marker(name, pos)` exports a point the runtime reads with
  `importedMarkers` (engine parking spots, lamp positions, anchors).
- **Variants** of one model (levels, states) are separate named objects in one
  GLB; share sub-models as their own node placed at markers (see the station's
  `Engine`).
- **Budgets:** the procedural model's triangle budget test is the budget,
  unless the brief says otherwise. Bevels cost ~30 triangles per box: use them
  where they catch light at city scale, never on anything under 5 cm
  (`kit.box` already skips those).
- **Size:** report the brotli size of every generated module
  (`brotli -c -q 11 <file> | wc -c`).

## Near levels of detail

The instanced buildings also have a detailed **near** model, drawn by
`LodInstances` (`components/city/lod.tsx`) for the few closest to the camera.
For the towers and mid-rises it is the archetype's own script run again with a
detailer attached (`buildings/nkit.py`, `bkit.Draft(near=...)`): every wall,
opening and window is placed by the same calls as the lean model, so the near
one shares its footprint and its `windows` rectangles by construction, and
`nkit` adds frames, mullions, transoms, cornice dentils, quoins, entrance
hardware, plant and railings on top. `buildings/near.py` exports one GLB per
model (`assets/models/building-<id>-near.glb`, node `Building`):

```
blender -b --python blender/export.py -- blender/buildings/near.py building-tower-crown-near
node scripts/import-model.ts assets/models/building-tower-crown-near.glb components/city/models/buildings/buildingTowerCrownNear.model.ts
blender -b --python blender/stage.py -- blender/out/near/crown blender/buildings/near.py@0   # lean and near, side by side
```

Detail is sized in world metres and converted per axis (`ux`, `uy`) because a
building is stretched to its instance size. The near tests hold it to world
distances, not to the lean models' unit-space layer (`near-checks.ts`).

The low-rise, residential and industrial archetypes, the village and town
buildings and the civic kit have theirs too, built the other way round: a
near script beside each lean one that imports the lean script's own constants
and openings, so the glazing stays in the lean model's `windows` rectangles.

- `buildings/detail.py` is the detailer, in world metres at the model's
  representative instance size: frames and glazing bars, sills, lintels with
  keystones, panelled doors with surrounds and steps, quoins, gutters,
  downpipes, ridge tiles, oculi. `buildings/nearkit.py` (`NearDraft`) dresses
  every opening of a `bkit.Draft` and cuts its walls into cells with grid lines
  round the trim (the occlusion is per vertex). Scripts: `house_near.py`,
  `parapet_near.py`, `pitched_near.py`, `warehouse_near.py`, one GLB each
  (`building-<id>-near`, node `BuildingNear`).
- The second pass at these (`detail.py`, `nearkit.py`, `snear.py`) adds sash windows
  with meeting rails and horns, sloped sills on aprons, flat arches of jointed
  stones with keystones, architraves, planted window boxes, doors with hinges,
  knockers and numbers on nosed steps, bargeboards, finials, corbelled dentil
  courses, water tables, brick and block plinths (`bricks`, laid course by
  course in stretcher bond), roof slates and tiles as pillows of four facets
  (`pillow`; the settlement's are cut by `snear._sliced_prism`, courses
  staggered, risers cut at the same joints), brick and ashlar walls with
  mortar set behind them (`snear.brick_wall`), roof plant (air-conditioning
  unit, dish) and rainwater hoppers. Every detail keeps at least 2 cm off any
  face it overlaps (the near checks fail it otherwise), and rooftop plant stays
  under the lean model's height plus the outline tolerance.
- `buildings/tone.py` holds the near model's tone to the lean one's: after the
  bake it reads the lean model's GLB, takes each material role's mean shade
  (occlusion times the material's tone, as the importer multiplies them) and
  bends the near occlusion by a power law per role until the means agree, so
  the swap does not flash darker or lighter. `lowrise.test.ts` checks it (mean
  plaster and slate shade within 5 % of the lean model's).
- `settlement/snear.py` swaps the lean settlement scripts' own `window`, `door`,
  `wall`, `chimney` and `gable_roof` for richer ones (`near_cottage.py`,
  `near_terrace.py`, `near_shopfront.py`, `near_apartment.py`,
  `near_farmhouse.py`, `near_barn.py`), so their layout and openings carry over
  exactly. One GLB per script (`cottage-near`, `terrace-near`, ...), nodes
  `<Lean>Near`.
- `civic/civic_kit_near.py` is every part of the civic kit again (`civic-kit-near`,
  same node names and frames); `civic.ts` assembles the near building from it
  (`buildCivic(..., { near: true })`) and `Building.tsx` swaps the two by
  distance, since each civic building is drawn once.
- Compare lean and near at instance size, one model per process:

  ```
  blender -b -t 2 --python blender/buildings/nearstage.py -- blender/out/near/house 4.4 4.2 4.4 blender/buildings/house.py blender/buildings/house_near.py
  blender -b -t 2 --python blender/buildings/nearstage.py -- blender/out/near/terrace 6 5.4 5 blender/settlement/terrace.py blender/settlement/near_terrace.py
  ```

## Loading

The importer writes two files per model: `<name>.data.ts` (the model) and
`<name>.model.ts`, a stub whose `MODEL` is a handle from `lazyModel`. Only
`loadModels()` imports the data files, so the bundler gives each its own chunk
and the main bundle carries none of it. `useModelsReady()` (in
`components/city/models/useModels.ts`) starts the download when the app opens
and holds the city back until it lands, retrying once and then reloading on
the procedural models if it cannot. With `?models=procedural` nothing is
fetched.

The near levels (`*Near.model.ts`, stubs the importer writes with
`{ deferred: true }`) are not part of that. `loadModels()` skips them; once the
city is on screen `loadNearModels()` fetches them one at a time (never on the
low tier or with `?models=procedural`), and `useNearModels()` returns a number
that bumps as each lands. A near accessor returns null until its own model is
in (`isModelLoaded`), so a consumer calls the hook and puts the number in its
memo deps; `useSceneNear` keeps a scene lean until every near model is in.

So **never read a model while a module is evaluated** (a top-level
`const X = MODEL.meta`, a geometry built at import): read it inside a function
or a hook. Tests get every data module handed over by `vitest.setup.ts`; the
probe that catches import-time reads runs on its own:

```
pnpm vitest run --config vitest.models.config.mts
```

## Near levels

Instanced models also have a **near** level: a much richer model of the same
thing, drawn by `LodInstances` (`components/city/lod.tsx`) for the few
instances closest to the camera while the lean one stays for the rest of the
city. A near model is authored in the same frame, on the same pivot and
footprint, with the same material roles, so the swap only adds detail.

- The fleet's is `blender/fleet/near.py` (bodies and tractor), with
  `blender/vehicles2/parts_near.py` (wheel and lamps) and
  `blender/fleet/nearkit.py` (the finer loft and the details that follow the
  body's skin by ray casting). One GLB, `fleet-near`:

  ```
  blender -b --python blender/export.py -- blender/fleet/near.py fleet-near
  node scripts/import-model.ts assets/models/fleet-near.glb components/city/models/vehicles/fleetNear.model.ts
  ```

- Compare lean and near for body `n` of `near.py`'s `BODIES` (6 is the tractor):

  ```
  blender -b --python blender/stage.py -- blender/out/fleet/n blender/vehicles2/parts.py@n blender/fleet/near.py@n
  ```

- The lean fleet's loft sections live in `fleet.py`'s `*_shell()` functions so
  both levels loft the same sections.

- The crowd's is `blender/crowd/near.py` (with `blender/crowd/nearparts.py`:
  turned shapes, banded cones, wheels, and the worker, beacon, stop board and
  flag in detail): every form the backlog crowd draws, up to 3,000 triangles
  each, one GLB, `crowd-near`. A hoarding's near kit is laid out round its plot
  by `hoardingKit(..., near)` in `components/city/backlog/forms.ts`, like the
  lean one.

  ```
  blender -b --python blender/export.py -- blender/crowd/near.py crowd-near
  node scripts/import-model.ts assets/models/crowd-near.glb components/city/backlog/crowdNear.model.ts
  ```

  Compare form `n` of `FORMS` in `near.py` (fire, collision, wreck, roadblock,
  pothole, signpost, van, scaffold, trench, survey), lean on the left:

  ```
  blender -b --python blender/stage.py -- blender/out/crowd/n blender/crowd/near.py@n
  ```

## Near levels of the scenes

The construction sites, the street incidents and the finished houses are drawn
a handful of times each, so their near level is not an instance swap: the whole
scene goes near at once (`components/city/sceneLod.ts`, at most three sites and
four incidents within reach of the camera; the quality tier scales it) and is
drawn from the near models instead of the lean ones. The near models are in
`blender/scenes_near/`, one script per lean script (`crane_near.py`,
`props_near.py`, `site_near.py`, `incident_props_near.py`,
`incident_kit_near.py`, `dressing_near.py`, and a `*_near.py` per emergency
vehicle), with the same node names, origins, frames and markers:

```
blender/scenes_near/run.sh                    every near model: script -> GLB -> module
blender/scenes_near/run.sh crane-near         one of them
```

`kit_near.refine()` re-runs a lean script's own builders with rounder
cylinders and softer edges, and `Acc` collects thousands of tubes and bolts
into one bmesh per material; `vnear.install()` swaps the vehicles' shared
wheels, lamps, light bars, mirrors and handles for the near ones. The builders
in TypeScript are run `atLevel("near", ...)` (`models/detailLevel.ts`): the
helpers that place a node ask `modelFor` for the model that has it, and every
cache keys on the level.

Look at a whole scene, lean beside near, as the app assembles it:

```
EXPORT_PLY=1 pnpm vitest run blender/scenes_near/export-scenes
blender -b -t 2 --python blender/stage.py -- blender/out/scenes/x blender/out/scenes/lean-incident-major.ply blender/out/scenes/near-incident-major.ply
```

- **The landmarks'** near levels are not instanced: each landmark is drawn
  once, so its near model replaces the lean one outright wherever the quality
  tier is not `low` (`components/city/Landmark.tsx`, `models/landmarks/near.ts`).
  Each is the lean script's own parts plus a great deal drawn over them
  (`blender/landmarks/*_near.py`, 20,000 to 60,000 triangles), through
  `blender/landmarks/nkit.py` (`Acc`: geometry gathered straight into one mesh
  per material, in local frames; `openings()` and `slopes()` read the lean
  mesh's glass boxes and roof faces so every window and roof is treated;
  `courses()` and `ribs()` lay masonry and cladding only where a ray finds the
  wall) and `blender/landmarks/ndetail.py` (windows, lancets, slates,
  balusters, fluted columns, clocks, lettering, lamps, benches, paving, gravel,
  foliage, guard rails, downpipes). The near GLB carries no markers: the lean
  models' markers (lamps, engine spots, anchors) serve both levels.

  ```
  blender -b --python blender/export.py -- blender/landmarks/townhall_near.py town-hall-near
  node scripts/import-model.ts assets/models/town-hall-near.glb components/city/models/landmarks/townHallNear.model.ts
  ```

  The pairs are `townhall_near` / `town-hall-near`, `fire_near` (three levels
  and the engine) / `fire-station-near`, `info_near` / `info-centre-near`,
  `power_near` (plant, both chimneys, bare yard) / `power-station-near`,
  `station_near` / `transit-station-near`, `train_near` (train and both
  pantographs) / `transit-train-near`, `chapel_near` / `village-chapel-near`,
  `village_fire_near` / `village-fire-near`, `halt_near` / `village-halt-near`,
  `substation_near` / `village-substation-near`. Compare a lean and a near
  level with `stage.py`: `blender -b --python blender/stage.py -- blender/out/x
  blender/landmarks/info.py@3 blender/landmarks/info_near.py@3`. A landmark's
  Part component paints only the slots the lean model uses: a near model must
  not add a colour slot (the village fire station has no green, so no foliage).

## Gotchas already paid for

- Join evaluated meshes with `material.original` (done in `kit.finish`), or
  Blender crashes on the next depsgraph update.
- Never call `view_layer.update()` mid-build.
- Faces are shaded per vertex: slice big faces (`box(..., cell=1.5)`) or the
  whole face takes its corners' occlusion.
- Merged geometries need identical attributes: imported geometry carries
  position, normal, uv (zeros), color, and surface when asked.
