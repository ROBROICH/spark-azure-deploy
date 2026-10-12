import { describe, expect, test } from "bun:test";
import { inArray } from "drizzle-orm";

import { runCheckpointCleanup, startCheckpointCleanup } from "../src/checkpoint-cleanup.ts";
import { fileHistory, files } from "../src/db/schema.ts";
import { StorageNotFoundError, type S3Storage } from "../src/storage/s3-storage.ts";
import { createMutationDatabase } from "./support/mutation-database.ts";

describe.skipIf(process.env.DMS_MUTATION_DATABASE_URL === undefined)(
  "DMS checkpoint cleanup persistence",
  () => {
    test("keeps failed and unattempted rows recoverable across cleanup attempts", async () => {
      const { client, db } = createMutationDatabase();
      const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
      const objects = new Set(ids.map((id) => `checkpoints/${id}`));
      const failure = new Error("storage unavailable");
      let fail = true;
      const attempted: string[] = [];
      const storage: Pick<S3Storage, "delete"> = {
        async delete(path) {
          attempted.push(path);
          if (fail && attempted.length === 2) throw failure;
          if (!objects.delete(path)) {
            throw StorageNotFoundError({ message: `Document '${path}' not found` });
          }
        },
      };
      const options = { retentionDays: 14, now: new Date("2026-10-05T00:00:00Z") };
      try {
        await db.insert(files).values([
          ...ids.map((id) => ({
            id,
            projectVersion: 1,
            filename: `${id}.json`,
            bucketPath: `checkpoints/${id}`,
            mimeType: "application/json",
            type: "TEMPORAL_CHECKPOINT" as const,
            isDeleted: false,
            createdAt: new Date("2000-01-01T00:00:00Z"),
          })),
          {
            id: ids[0]!,
            projectVersion: 2,
            filename: "retained.json",
            bucketPath: "checkpoints/retained",
            mimeType: "application/json",
            type: "TEMPORAL_CHECKPOINT" as const,
            isDeleted: false,
            createdAt: new Date("2026-10-05T00:00:00Z"),
          },
        ]);
        await expect(runCheckpointCleanup(db, storage, options)).rejects.toBe(failure);
        const remaining = await db.select().from(files).where(inArray(files.id, ids));
        expect(remaining.filter((row) => row.projectVersion === 1)).toHaveLength(2);
        expect(remaining.filter((row) => row.projectVersion === 2)).toHaveLength(1);

        fail = false;
        expect(await runCheckpointCleanup(db, storage, options)).toHaveLength(2);
        expect(objects.size).toBe(0);
        expect(
          (await db.select().from(files).where(inArray(files.id, ids))).map(
            ({ projectVersion }) => projectVersion,
          ),
        ).toEqual([2]);
      } finally {
        await db.delete(files).where(inArray(files.id, ids));
        await db.delete(fileHistory).where(inArray(fileHistory.id, ids));
        await client.close();
      }
    });
  },
);

describe("DMS Temporal checkpoint cleanup", () => {
  test("rejects invalid retention before touching app-owned state", async () => {
    let touched = false;
    expect(await (
      runCheckpointCleanup(
        Object.assign(Object.create(null), {
          select: () => {
            touched = true;
          },
        }),
        { async delete() {} },
        { retentionDays: 0, now: new Date() },
      ).catch((error) => error)
    )).toHaveProperty("message", expect.stringContaining("positive integer"));
    expect(touched).toBeFalse();
  });

  test("runs immediately, retries after the six-hour scheduling boundary, and stops once", async () => {
    const cleanupFailure = new Error("provider unavailable");
    let attempts = 0;
    let secondAttempt!: () => void;
    const secondAttempted = new Promise<void>((resolve) => {
      secondAttempt = resolve;
    });
    const cleanup = startCheckpointCleanup(async () => {
      attempts += 1;
      if (attempts === 1) throw cleanupFailure;
      secondAttempt();
      return ["checkpoint-a"];
    }, 1);

    try {
      await secondAttempted;
      await Promise.all([cleanup.close(), cleanup.close()]);
      await cleanup.done;
      expect(attempts).toBe(2);
    } finally {
      await cleanup.close();
      await cleanup.done;
    }
  });
});
