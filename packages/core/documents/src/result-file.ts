import { createHash } from "node:crypto";
import type { TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Result } from "better-result";
import { EvlogError } from "evlog";

import { dmsErrors } from "./errors.ts";
import type { DocumentsService } from "./resource.ts";

export async function loadResultFile<Schema extends TSchema>(
  documents: Pick<DocumentsService, "readResultFile">,
  schema: Schema,
  fileId: string,
  projectId: string,
  requestedProjectVersion?: number,
) {
  const read = await Result.tryPromise({
    try: () => documents.readResultFile(fileId, requestedProjectVersion),
    catch: (cause) =>
      EvlogError.isEvlogError(cause)
        ? cause
        : dmsErrors.STORAGE_UNAVAILABLE({
            cause: cause instanceof Error ? cause : undefined,
            internal: { fileId },
          }),
  });
  if (read.isErr()) return read;
  const file = read.value;
  if (file.projectId !== projectId) {
    return Result.err(
      dmsErrors.NOT_FOUND({
        message: `Result file ${fileId} not found in project ${projectId}`,
        internal: { fileId, projectId, actualProjectId: file.projectId },
      }),
    );
  }
  const content = Result.try({
    try: () => JSON.parse(new TextDecoder().decode(file.bytes)),
    catch: (cause) =>
      dmsErrors.INVALID_REQUEST({
        message: `Result file ${fileId} is not valid JSON`,
        cause: cause instanceof Error ? cause : undefined,
        internal: { fileId, projectId },
      }),
  });
  if (content.isErr()) return content;
  return Result.try({
    try: () => ({
      projectVersion: file.projectVersion,
      payload: Value.Parse(schema, content.value),
      digest: createHash("sha256").update(file.bytes).digest("hex"),
    }),
    catch: (cause) =>
      dmsErrors.INVALID_REQUEST({
        message: `Result file ${fileId} does not match its result contract`,
        cause: cause instanceof Error ? cause : undefined,
        internal: { fileId, projectId, projectVersion: file.projectVersion },
      }),
  });
}
