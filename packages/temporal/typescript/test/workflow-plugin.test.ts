import { expect, test } from "bun:test";
import { resolve } from "node:path";

import { sparkTemporalWorkflowVite } from "../src/workflow-plugin.ts";

test("Vite plugin claims ?workflow imports", () => {
  const workflowPath = resolve(import.meta.dir, "fixtures/empty-workflow.ts");
  const plugin = sparkTemporalWorkflowVite();
  expect(
    plugin.resolveId?.(`${workflowPath}?workflow`, undefined, {}),
  ).toBe(`\0temporal-workflow:${workflowPath}`);
});
