import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The near levels load after the city is drawn (`loadNearModels`), not with
 * `loadModels()`; until their model is in, every near accessor returns null.
 */

const stubs = import.meta.glob("/components/**/*.model.ts", { eager: true, query: "?raw", import: "default" }) as Record<string, string>;

const empty = { materials: [], nodes: [], markers: [] };

describe("deferred near models", () => {
  it("registers every near stub as deferred and no lean one", () => {
    const files = Object.entries(stubs);
    expect(files.length).toBeGreaterThan(60);
    for (const [file, source] of files) {
      const near = /Near\.model\.ts$/.test(file);
      expect(source.includes("deferred: true"), file).toBe(near);
    }
  });

  it("keeps them out of loadModels and fetches them in loadNearModels, one bump each", async () => {
    const { lazyModel, loadModels, loadNearModels, modelsLoaded, nearModelsLoaded, nearModelsVersion, isModelLoaded } = await import("./imported");
    const fetched: string[] = [];
    const load = (key: string) => async () => {
      fetched.push(key);
      return { DATA: { ...empty } };
    };
    const lean = lazyModel("zz-lean-probe", load("lean"));
    const nearA = lazyModel("zz-near-probe-a", load("a"), { deferred: true });
    const nearB = lazyModel("zz-near-probe-b", load("b"), { deferred: true });

    await loadModels();
    expect(fetched).toEqual(["lean"]);
    expect(modelsLoaded()).toBe(true);
    expect(nearModelsLoaded()).toBe(false);
    expect(isModelLoaded(lean)).toBe(true);
    expect(isModelLoaded(nearA)).toBe(false);
    expect(() => nearA.nodes).toThrow(/before it loaded/);

    const before = nearModelsVersion();
    const seen: number[] = [];
    const { subscribeNearModels } = await import("./imported");
    const off = subscribeNearModels(() => seen.push(isModelLoaded(nearA) ? (isModelLoaded(nearB) ? 2 : 1) : 0));
    await loadNearModels();
    off();
    expect(fetched).toEqual(["lean", "a", "b"]);
    expect(nearModelsVersion()).toBe(before + 2);
    // The first bump comes with A alone in: consumers rebuild one model at a time.
    expect(seen).toEqual([1, 2]);
    expect(nearModelsLoaded()).toBe(true);
    expect(nearA.nodes).toEqual([]);
  });
});

describe("near accessors before their model has loaded", () => {
  afterEach(() => {
    vi.doUnmock("./modelSource");
    vi.resetModules();
  });

  it("return null, then the geometry once it lands", async () => {
    vi.resetModules();
    vi.doMock("./modelSource", () => ({ BLENDER_MODELS: true, PROCEDURAL_PARAM: "procedural" }));
    const props = await import("./props/near");
    const vehicles = await import("./vehicles/near");
    const walker = await import("./props/walkerModel");
    const landmarks = await import("./landmarks/near");
    const buildings = await import("./buildings/geometry");
    const civic = await import("./buildings/civic");
    const forms = await import("../backlog/forms");
    const registry = (globalThis as unknown as { __repoCityModels: { registry: Map<string, { data: unknown; deferred: boolean }> } }).__repoCityModels.registry;
    const keys = ["treesNear", "streetFurnitureNear", "street2Near", "fleetNear", "walkerNear", "civicKitNear", "townHallNear", "apartmentLowNear", "crowdNear", "buildingTowerCrownNear"];
    const saved = new Map(keys.map((key) => [key, registry.get(key)!.data]));
    for (const key of keys) {
      expect(registry.get(key)!.deferred, key).toBe(true);
      registry.get(key)!.data = null;
    }
    try {
      const nulls = () => [
        props.treeNearGeometry("broadleaf"),
        props.furnitureNearGeometry("bench"),
        props.furnitureNearGeometry("stop"),
        props.lampNearGeometry(),
        props.propBlockNearGeometry(),
        props.baleNearGeometry(),
        vehicles.nearBodyGeometry("sedan"),
        vehicles.nearWheelGeometry(),
        vehicles.nearTractorGeometry(),
        vehicles.nearParkedGeometry("sedan"),
        walker.walkerBodyNearGeometry(),
        walker.walkerHeadNearGeometry(),
        landmarks.townHallNear(),
        buildings.archetypeNearGeometry("tower-crown"),
        buildings.archetypeNearGeometry("apartment-low"),
        forms.nearFormGeometry(forms.CROWD_FORMS[0]),
        forms.nearHoardingPlotGeometry(6, 4),
      ];
      expect(nulls().every((value) => value === null)).toBe(true);
      expect(civic.civicNearReady()).toBe(false);

      for (const key of keys) registry.get(key)!.data = saved.get(key);
      expect(nulls().every((value) => value !== null)).toBe(true);
      expect(civic.civicNearReady()).toBe(true);
    } finally {
      for (const key of keys) registry.get(key)!.data = saved.get(key);
    }
  });
});
