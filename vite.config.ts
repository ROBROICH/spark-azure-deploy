import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";

import sbom from "rollup-plugin-sbom";
import { defineConfig } from "vite-plus";

import { temporalRuntimePlugin } from "@spark-temporal/typescript/runtime-plugin";
import { sparkTemporalWorkflowVite } from "@spark-temporal/typescript/workflow-plugin";

const packageDirectory = process.cwd();
const repositoryDirectory = import.meta.dirname;
const isWorkflowBackendBuild =
  packageDirectory === resolve(repositoryDirectory, "02-backend/apps/spark-backend");
const diplanService =
  packageDirectory === resolve(repositoryDirectory, "02-backend/apps/diplan_service");
const databasePackageDirectory = isWorkflowBackendBuild
  ? resolve(repositoryDirectory, "packages/core")
  : packageDirectory;
const betterDrizzle = resolve(
  databasePackageDirectory,
  "node_modules/better-drizzle/dist/index.cjs",
);
const require = createRequire(
  resolve(repositoryDirectory, "packages/temporal/typescript/package.json"),
);
const worker = isWorkflowBackendBuild ? require.resolve("@temporalio/worker") : "";
const workerRequire = createRequire(worker || import.meta.url);
const bridge = isWorkflowBackendBuild
  ? dirname(workerRequire.resolve("@temporalio/core-bridge"))
  : "";
const sourceMap = isWorkflowBackendBuild ? dirname(workerRequire.resolve("source-map")) : "";
const staticFiles = [
  ...(isWorkflowBackendBuild
    ? [
        "src/migrations",
        {
          from: resolve(
            repositoryDirectory,
            "02-backend/features/administrative_file_draft/src/document/template.docx",
          ),
          to: "dist",
        },
        {
          from: resolve(
            repositoryDirectory,
            "02-backend/features/identity_management_service/src/migrations/schema",
          ),
          to: "dist",
        },
        {
          from: resolve(repositoryDirectory, "packages/core/usecases/usecases"),
          to: "dist",
        },
      ]
    : []),
  ...(diplanService ? ["migrations"] : []),
  ...(isWorkflowBackendBuild
    ? [
        { from: resolve(sourceMap, "lib/mappings.wasm"), to: "dist" },
        ...["x86_64-unknown-linux-gnu", "aarch64-unknown-linux-gnu"].map((target) => ({
          from: resolve(bridge, "releases", target, "index.node"),
          to: `dist/releases/${target}`,
        })),
      ]
    : []),
];

export default defineConfig({
  run: {
    tasks: {
      "indirection:rules": {
        command:
          "./node_modules/@ast-grep/cli/ast-grep test --config tools/ast-grep/sgconfig.yml --skip-snapshot-tests",
        cache: false,
      },
      "indirection:check": {
        command:
          "./node_modules/@ast-grep/cli/ast-grep scan --config tools/ast-grep/sgconfig.yml 02-backend 04-shared-services packages scripts .gitlab/ci vite.config.ts",
        cache: false,
      },
      "db:check": {
        command:
          "vp exec --filter './02-backend/apps/*' --fail-if-no-match -- bun ../../../scripts/database-boundaries.ts check",
        cache: false,
      },
    },
  },
  lint: {
    jsPlugins: [
      {
        name: "anti-slop",
        specifier: "./tools/oxlint/anti-slop/index.ts",
      },
    ],
    rules: {
      "anti-slop/no-chained-type-assertions": "error",
      "anti-slop/no-conditional-empty-object-spread": "error",
      "anti-slop/no-known-value-widening": "error",
      "anti-slop/no-object-parameters": "error",
      "anti-slop/no-runtime-typeof": "error",
      "anti-slop/no-shape-in-symbol-names": "error",
      "anti-slop/no-unknown-parameters": "error",
      "anti-slop/no-unknown-type-aliases": "error",
      "anti-slop/no-unsafe-dictionary-type": "error",
      "anti-slop/no-widen-then-assert": "error",
    },
  },
  pack: {
    env: { NODE_ENV: process.env.NODE_ENV ?? "production" },
    alias: existsSync(betterDrizzle) ? { "better-drizzle": betterDrizzle } : {},
    copy: staticFiles,
    deps: {
      alwaysBundle: [/.*/],
      onlyBundle: false,
    },
    plugins: isWorkflowBackendBuild
      ? [
          sbom({
            outDir: "sboms",
            outFilename: `${process.env.NODE_ENV ?? "production"}.cdx`,
            includeWellKnown: false,
          }),
          sparkTemporalWorkflowVite(),
          temporalRuntimePlugin(packageDirectory),
        ]
      : [],
    sourcemap: true,
  },
});
