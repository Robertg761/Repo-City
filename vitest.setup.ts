/**
 * The Blender models' data (`*.data.ts`) is loaded asynchronously in the app
 * (`loadModels()` in components/city/models/imported.ts). Tests build models
 * synchronously, so hand every data module over before any test runs.
 */
import { preloadModels, type ImportedModel } from "@/components/city/models/imported";

// Vite's eager glob (vitest runs through Vite); the project's own types
// describe the bundler's lazy form, hence the cast.
const modules = import.meta.glob("/components/**/*.data.ts", { eager: true }) as unknown as Record<
  string,
  { KEY: string; DATA: ImportedModel }
>;
preloadModels(Object.values(modules));
