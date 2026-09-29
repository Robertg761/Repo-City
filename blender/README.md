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

## Loading

The importer writes two files per model: `<name>.data.ts` (the model) and
`<name>.model.ts`, a stub whose `MODEL` is a handle from `lazyModel`. Only
`loadModels()` imports the data files, so the bundler gives each its own chunk
and the main bundle carries none of it. `useModelsReady()` (in
`components/city/models/useModels.ts`) starts the download when the app opens
and holds the city back until it lands, retrying once and then reloading on
the procedural models if it cannot. With `?models=procedural` nothing is
fetched.

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

## Gotchas already paid for

- Join evaluated meshes with `material.original` (done in `kit.finish`), or
  Blender crashes on the next depsgraph update.
- Never call `view_layer.update()` mid-build.
- Faces are shaded per vertex: slice big faces (`box(..., cell=1.5)`) or the
  whole face takes its corners' occlusion.
- Merged geometries need identical attributes: imported geometry carries
  position, normal, uv (zeros), color, and surface when asked.
