import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/db/migrate.ts"],
  format: "esm",
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // The shared workspace package ships TypeScript sources: bundle it in.
  noExternal: ["@synkro/shared"],
});
