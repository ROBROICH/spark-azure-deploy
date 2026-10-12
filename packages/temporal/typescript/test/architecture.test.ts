import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

test("official SDK imports stay in the Temporal integration modules", () => {
  const paths = readdirSync(resolve(import.meta.dir, "../src")).filter((path) =>
    path.endsWith(".ts"),
  );
  const integrationModules = new Set([
    "context.ts",
    "s3-payload-codec.ts",
    "worker.ts",
    "workflow-interceptors.ts",
  ]);
  const integrationSource = paths
    .filter((path) => integrationModules.has(path))
    .map((path) => readFileSync(resolve(import.meta.dir, "../src", path), "utf8"))
    .join("\n");
  const source = paths
    .filter((path) => !integrationModules.has(path))
    .map((path) => readFileSync(resolve(import.meta.dir, "../src", path), "utf8"))
    .join("\n");
  expect(source).not.toMatch(/from ["'](?:@temporalio|temporalio)/);
  expect(integrationSource).toMatch(/from ["']@temporalio\/worker["']/);
  for (const allSource of [source, integrationSource]) {
    expect(allSource).not.toContain("temporal_codec_service");
    expect(allSource).not.toContain("TEMPORAL_CODEC_ENDPOINT");
  }
});

test("workflow interceptor remains sandbox-safe and package-private", () => {
  const sourceDirectory = resolve(import.meta.dir, "../src");
  const workflowInterceptor = readFileSync(
    resolve(sourceDirectory, "workflow-interceptors.ts"),
    "utf8",
  );
  expect(workflowInterceptor).not.toMatch(/from ["']node:/);
  expect(workflowInterceptor).not.toMatch(/from ["']@temporalio\/(?:activity|client|worker)["']/);
  expect(workflowInterceptor).not.toContain("@spark-workflow/audit-client");
  expect(workflowInterceptor).not.toMatch(/from ["']\.\/context["']/);

  expect(workflowInterceptor).toContain('from "./context-header.js"');

  const packageJson = readFileSync(resolve(import.meta.dir, "../package.json"), "utf8");
  expect(packageJson).not.toContain('".":');
  expect(packageJson).not.toContain('"./provider"');
  expect(packageJson).not.toContain('"./runtime"');
  expect(packageJson).not.toContain("context-header");
  expect(packageJson).not.toContain("workflow-interceptors");
});
