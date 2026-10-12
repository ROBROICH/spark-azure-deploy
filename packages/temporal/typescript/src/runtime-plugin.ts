import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

export const workflowCryptoInjectPath = resolve(import.meta.dirname, "workflow-crypto-inject.js");

export function temporalRuntimePlugin(packageDirectory: string) {
  const require = createRequire(import.meta.url);

  return {
    name: "temporal-runtime",
    resolveId(source: string, importer: string | undefined) {
      if (
        source === "./workflow/bundler" &&
        importer?.endsWith("@temporalio/worker/lib/worker.js")
      ) {
        return "\0temporal-runtime-bundler";
      }
    },
    load(id: string) {
      if (id === "\0temporal-runtime-bundler") {
        return "export const defaultWorkflowInterceptorModules=[];export class WorkflowCodeBundler{constructor(){throw new Error('Runtime workflow bundling is disabled')}}";
      }
    },
    transform(code: string, id: string) {
      if (!id.endsWith("@temporalio/worker/lib/workflow/threaded-vm.js")) return;
      return {
        code: code.replace(
          "require.resolve('./workflow-worker-thread')",
          "new URL('./workflow-worker-thread.cjs', import.meta.url)",
        ),
        map: null,
      };
    },
    writeBundle() {
      const output = resolve(packageDirectory, "dist/workflow-worker-thread.cjs");
      const result = spawnSync(
        "bun",
        [
          "build",
          require.resolve("@temporalio/worker/lib/workflow/workflow-worker-thread.js"),
          "--target=bun",
          "--format=cjs",
          "--sourcemap=external",
          `--outdir=${resolve(packageDirectory, "dist")}`,
          "--entry-naming=workflow-worker-thread.cjs",
        ],
        { stdio: "inherit" },
      );
      if (result.status !== 0) throw new Error("Temporal worker bundle failed");
      writeFileSync(
        output,
        readFileSync(output, "utf8")
          .replace(/var __dirname = "[^"]+";/g, "var __dirname = process.cwd();")
          .replace(/var __filename = "[^"]+";/g, 'var __filename = "workflow-worker-thread.cjs";'),
      );
    },
  };
}
