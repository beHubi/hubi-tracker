import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs", "iife"],
  globalName: "HubiSDK",
  dts: true,
  minify: true,
  sourcemap: true,
  clean: true,
  target: "es2017",
  treeshake: true,
});
