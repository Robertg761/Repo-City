/**
 * The Blender models' data arrives after the code that uses it has loaded
 * (`loadModels()` in `imported.ts`), so nothing may read a model while its
 * module is evaluated. This imports every city module with the Blender models on
 * on and no model data loaded; any module that reads one at import throws.
 *
 *   pnpm vitest run --config vitest.models.config.mts
 *
 * Kept out of the main suite, whose setup hands all the data over up front.
 */
import { expect, test, vi } from "vitest";

vi.mock("@/components/city/models/modelSource", () => ({ BLENDER_MODELS: true }));

const files = Object.keys(
  import.meta.glob([
    "/components/**/*.ts",
    "/components/**/*.tsx",
    "!/components/**/*.test.ts",
    "!/components/**/*.probe.ts",
    "!/components/**/*.data.ts",
    "!/components/**/*.model.ts",
  ]),
);

test("no module reads model data while it loads", async () => {
  const failures: string[] = [];
  for (const file of files) {
    try {
      await import(/* @vite-ignore */ file);
    } catch (e) {
      failures.push(`${file}: ${(e as Error).message.split("\n")[0]}`);
    }
  }
  expect(files.length).toBeGreaterThan(100);
  expect(failures).toEqual([]);
});
