import { and, asc, eq, lt } from "drizzle-orm";
import { EvlogError, log } from "evlog";

import type { DmsDatabase } from "./db.ts";
import { files } from "./db/schema.ts";
import { StorageNotFoundError, type S3Storage } from "./storage/s3-storage.ts";

export const CHECKPOINT_CLEANUP_INTERVAL_MILLISECONDS = 6 * 60 * 60 * 1_000;
const CHECKPOINT_CLEANUP_BATCH_SIZE = 100;

export async function runCheckpointCleanup(
  database: DmsDatabase,
  storage: Pick<S3Storage, "delete">,
  options: { readonly retentionDays: number; readonly now?: Date },
): Promise<string[]> {
  if (!Number.isSafeInteger(options.retentionDays) || options.retentionDays <= 0) {
    throw new TypeError("checkpoint retentionDays must be a positive integer");
  }
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getTime() - options.retentionDays * 86_400_000);
  const checkpoints = await database
    .select({ id: files.id, projectVersion: files.projectVersion, bucketPath: files.bucketPath })
    .from(files)
    .where(and(eq(files.type, "TEMPORAL_CHECKPOINT"), lt(files.createdAt, cutoff)))
    .orderBy(asc(files.createdAt), asc(files.id), asc(files.projectVersion))
    .limit(CHECKPOINT_CLEANUP_BATCH_SIZE);
  const deleted: string[] = [];
  for (const checkpoint of checkpoints) {
    try {
      await storage.delete(checkpoint.bucketPath);
    } catch (error) {
      if (!(EvlogError.isEvlogError(error) && error.code === StorageNotFoundError.code)) {
        throw error;
      }
    }
    const removed = await database
      .delete(files)
      .where(
        and(
          eq(files.id, checkpoint.id),
          eq(files.projectVersion, checkpoint.projectVersion),
          eq(files.bucketPath, checkpoint.bucketPath),
          eq(files.type, "TEMPORAL_CHECKPOINT"),
          lt(files.createdAt, cutoff),
        ),
      )
      .returning({ id: files.id });
    deleted.push(...removed.map(({ id }) => id));
  }
  return deleted;
}

export function startCheckpointCleanup(
  cleanup: () => Promise<readonly string[]>,
  intervalMilliseconds = CHECKPOINT_CLEANUP_INTERVAL_MILLISECONDS,
) {
  if (!Number.isSafeInteger(intervalMilliseconds) || intervalMilliseconds <= 0) {
    throw new TypeError("checkpoint cleanup intervalMilliseconds must be a positive integer");
  }

  let stopping = false;
  let wake: (() => void) | undefined;

  const wait = (): Promise<void> =>
    new Promise((resolve) => {
      const timeout = setTimeout(() => {
        wake = undefined;
        resolve();
      }, intervalMilliseconds);
      wake = () => {
        clearTimeout(timeout);
        wake = undefined;
        resolve();
      };
    });

  const done = (async () => {
    while (!stopping) {
      try {
        const ids = await cleanup();
        log.info({
          message: "Document Management checkpoint cleanup deleted rows",
          deletedRows: ids.length,
        });
      } catch (error) {
        log.error({
          message: "Document Management checkpoint cleanup failed; retrying after the interval",
          error,
        });
      }
      if (!stopping) await wait();
    }
  })();

  const close = async () => {
    stopping = true;
    wake?.();
    await done;
  };

  return { done, close };
}
