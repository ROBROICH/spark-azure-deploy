import { ANONYMISIERUNG_TASK_QUEUE, ANONYMISIERUNG_WORKFLOW } from "@spark-temporal/contracts";
import { Result, type Result as ResultType } from "better-result";
import { t } from "elysia";
import { createHash } from "node:crypto";
import { EvlogError } from "evlog";

import { agentOrchestrationErrors, type AnonymizationRequestError } from "../errors.ts";
import {
  UuidSchema,
  type AnonymizationCommandInput,
  type AnonymizationResult,
} from "../schemas.ts";

export const AnonymizationBodySchema = t.Object(
  {
    requestId: UuidSchema,
    file: t.Optional(t.File()),
  },
  { additionalProperties: false },
);

export async function executeAnonymizationRequest(
  body: { requestId: string; file?: Blob },
  execute: (input: AnonymizationCommandInput) => Promise<AnonymizationResult>,
  user: { readonly sub: string } | null,
): Promise<ResultType<Response, AnonymizationRequestError>> {
  const bytes = body.file === undefined ? undefined : new Uint8Array(await body.file.arrayBuffer());
  if (bytes?.length === 0) {
    return Result.err(
      agentOrchestrationErrors.EMPTY_PDF({
        internal: { requestId: body.requestId },
      }),
    );
  }
  if (bytes !== undefined && new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") {
    return Result.err(
      agentOrchestrationErrors.UNSUPPORTED_UPLOAD({
        internal: { requestId: body.requestId },
      }),
    );
  }
  const result = await Result.tryPromise({
    try: () =>
      execute({
        workflowName: ANONYMISIERUNG_WORKFLOW,
        executionId:
          user === null
            ? `anonymize-development-${body.requestId}`
            : `anonymize-user-${createHash("sha256").update(user.sub).digest("hex")}-${body.requestId}`,
        taskQueue: ANONYMISIERUNG_TASK_QUEUE,
        requestId: body.requestId,
        pdfBase64: bytes === undefined ? undefined : Buffer.from(bytes).toString("base64"),
        idReusePolicy: "REJECT_DUPLICATE",
        idConflictPolicy: "USE_EXISTING",
        priority: { fairnessKey: "priority", fairnessWeight: 2 },
      }),
    catch: (cause) =>
      EvlogError.isEvlogError(cause)
        ? cause
        : agentOrchestrationErrors.TEMPORAL_COMMAND_FAILED({
            cause: cause instanceof Error ? cause : undefined,
            internal: { requestId: body.requestId },
          }),
  });
  if (result.isErr()) return result;
  return Result.ok(
    new Response(Buffer.from(result.value.pdfBase64, "base64"), {
      headers: { "content-type": result.value.mediaType },
    }),
  );
}
