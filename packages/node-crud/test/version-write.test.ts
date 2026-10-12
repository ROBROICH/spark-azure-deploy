import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import { createError } from "evlog";

import { transactVersionWrite } from "../src/index.ts";

const projectId = "60000000-0000-4000-8000-000000000001";

const recordingWrite = (admitted: boolean) => {
  const steps: string[] = [];
  const conflict = createError({ status: 409, message: "Version is locked" });
  return {
    steps,
    conflict,
    write: {
      postgres: {
        transact: async <T>(work: () => Promise<T>) => {
          steps.push("begin");
          const result = await work();
          steps.push("commit");
          return result;
        },
      },
      projects: {
        validateWriteVersion: async (id: string, version: number) => {
          steps.push(`admit ${id} v${version}`);
          return admitted ? Result.ok(undefined) : Result.err(conflict);
        },
      },
      projectId,
      projectVersion: 3,
    },
  };
};

describe("transactVersionWrite", () => {
  test("runs the work inside the transaction after admitting the version", async () => {
    const { steps, write } = recordingWrite(true);

    const result = await transactVersionWrite(write, async () => {
      steps.push("work");
      return 7;
    });

    expect(result).toBe(7);
    expect(steps).toEqual(["begin", `admit ${projectId} v3`, "work", "commit"]);
  });

  test("throws the admission error without running the work", async () => {
    const { steps, conflict, write } = recordingWrite(false);

    await expect(
      transactVersionWrite(write, async () => {
        steps.push("work");
      }),
    ).rejects.toBe(conflict);
    expect(steps).toEqual(["begin", `admit ${projectId} v3`]);
  });
});
