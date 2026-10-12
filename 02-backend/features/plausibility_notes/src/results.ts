import { auditEntry } from "@spark-workflow/audit-client/persistence";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { loadResultFile } from "@spark-workflow/core/documents/data";
import type { DocumentsService } from "@spark-workflow/core/documents/resource";
import { transactVersionWrite, type ProjectVersionPeer } from "@spark-workflow/node-crud";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { better } from "better-drizzle";

import { plausibilityResultDeliveries, plausibilitySchema } from "./db/schema.ts";
import { plausibilityErrors } from "./errors.ts";
import { PlausibilityResultFileSchema } from "./schemas.ts";

type ResultDelivery = typeof plausibilityResultDeliveries.$inferSelect;

export async function processPlausibilityResults(
  postgres: PostgresScope<typeof plausibilitySchema>,
  documents: Pick<DocumentsService, "readResultFile">,
  projects: Pick<ProjectVersionPeer, "validateWriteVersion">,
  projectId: string,
  fileId: string,
  requestedVersion?: number,
) {
  const file = await loadResultFile(
    documents,
    PlausibilityResultFileSchema,
    fileId,
    projectId,
    requestedVersion,
  );
  if (file.isErr()) throw file.error;
  const { projectVersion, payload, digest } = file.value;
  const deliveryKey = { projectId, projectVersion, fileId };
  const deliveredOutcome = (delivery: ResultDelivery) => {
    if (delivery.contentDigest !== digest) {
      throw plausibilityErrors.RESULT_DELIVERY_CONFLICT({ internal: deliveryKey });
    }
    return {
      status: delivery.contradictionsFound === 0 ? "no_contradictions" : "contradictions_found",
      contradictionsFound: delivery.contradictionsFound,
      totalOccurrences: delivery.totalOccurrences,
      previousRecordsDeleted: delivery.previousRecordsDeleted,
    };
  };
  const applied = await postgres.query((query) =>
    better(query, { schema: plausibilitySchema }).plausibilityResultDeliveries.findUnique({
      where: deliveryKey,
    }),
  );
  if (applied !== null) return deliveredOutcome(applied);
  return transactVersionWrite({ postgres, projects, projectId, projectVersion }, () =>
    postgres.query(async (transaction) => {
      const database = better(transaction, { schema: plausibilitySchema });
      const concurrent = await database.plausibilityResultDeliveries.findUnique({
        where: deliveryKey,
      });
      if (concurrent !== null) return deliveredOutcome(concurrent);
      const previous = await database.plausibilityNotes.deleteMany({
        where: { projectId, projectVersion },
      });
      if (payload.contradictions.length > 0) {
        await database.plausibilityNotes.createMany({
          data: payload.contradictions.map((contradiction) => ({
            id: contradiction.id,
            projectId,
            projectVersion,
            title: contradiction.title,
            description: contradiction.description,
            rating: contradiction.rating,
            confidenceScore: contradiction.confidenceScore ?? null,
            scoreA: contradiction.scoreA ?? null,
            scoreB: contradiction.scoreB ?? null,
            evidence: contradiction.evidence ?? null,
            mergedCount: contradiction.mergedCount ?? null,
            status: contradiction.status,
          })),
        });
        const occurrences = payload.contradictions.flatMap((contradiction) =>
          contradiction.occurrences.map((occurrence) => ({
            id: crypto.randomUUID(),
            projectId,
            projectVersion,
            plausibilityNoteId: contradiction.id,
            ...occurrence,
            contradiction: occurrence.contradiction ?? null,
          })),
        );
        if (occurrences.length > 0) {
          await database.plausibilityNoteOccurrences.createMany({ data: occurrences });
        }
      }
      const audit = auditEntry(projectId, {
        entityType: "project",
        entityId: projectId,
        changeType: "action",
        actionType: "plausibility_results_processed",
      });
      await transaction.insert(auditLogs).values(audit);
      const delivery = await database.plausibilityResultDeliveries.create({
        data: {
          ...deliveryKey,
          auditId: audit.id,
          contentDigest: digest,
          contradictionsFound: payload.contradictions.length,
          totalOccurrences: payload.contradictions.reduce(
            (total, contradiction) => total + contradiction.occurrences.length,
            0,
          ),
          previousRecordsDeleted: previous.count,
        },
      });
      return deliveredOutcome(delivery);
    }),
  );
}

export type PlausibilityResults = Awaited<ReturnType<typeof processPlausibilityResults>>;
