import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** The model-loading probe (`components/city/models/load.probe.ts`), without the data preload. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { environment: "node", include: ["components/city/models/load.probe.ts"] },
});
