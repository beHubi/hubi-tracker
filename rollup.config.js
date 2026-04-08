import typescript from "@rollup/plugin-typescript";
import dts from "rollup-plugin-dts";

const input = "src/index.ts";

export default [
  {
    input,
    output: [
      {
        file: "dist/hubi-tracker.esm.js",
        format: "esm",
        sourcemap: true,
      },
      {
        file: "dist/hubi-tracker.cjs",
        format: "cjs",
        sourcemap: true,
        exports: "named",
      },
      {
        file: "dist/hubi-tracker.iife.js",
        format: "iife",
        name: "HubiSDK",
        exports: "named",
        sourcemap: true,
      },
    ],
    plugins: [
      typescript({
        tsconfig: "./tsconfig.json",
        declaration: false,
      }),
    ],
  },
  {
    input,
    output: { file: "dist/index.d.ts", format: "esm" },
    plugins: [dts()],
  },
];
