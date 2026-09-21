import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Unit tests only: pure logic next to the code as `*.test.ts` (PLAN.md section
 * 33). The `@/*` alias mirrors tsconfig so tests import the same way the app
 * does. No React plugin is configured because component tests are out of scope
 * for the MVP.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", ".claude/**"],
  },
});
