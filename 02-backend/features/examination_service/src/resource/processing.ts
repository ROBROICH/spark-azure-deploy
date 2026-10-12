import { createHash } from "node:crypto";
import {
  executeNodeMutation,
  nodeColumn,
  nodeDefinition,
  NodeDatabaseRowsSchema,
  transactVersionWrite,
  trustedServiceAuthorization,
  type NodeDatabaseRow,
  type NodeMutationInput,
  type NodeRuntime,
} from "@spark-workflow/node-crud";
import { Value } from "@sinclair/typebox/value";
import type { mapFundstellen } from "@spark-temporal/contracts";
import { better } from "better-drizzle";
import { groupBy, omit } from "es-toolkit";
import { and, eq, getTableColumns, inArray } from "drizzle-orm";

import { examinationSchema } from "../db/schema.ts";
import { examinationErrors } from "../errors.ts";

type ExaminationNodes = NodeRuntime<typeof examinationSchema>;

export interface ProcessingSourceRevision {
  nodeType: string;
  id: string;
  updatedAt: string;
  digest: string;
  isOutdated: boolean;
  satzId?: string;
}

export interface AssessmentReplacement {
  satzId: string;
  bewertungId: string;
  sources: ProcessingSourceRevision[];
  inserts: NonNullable<NodeMutationInput["inserts"]>;
}

export interface FundstellenReplacement {
  resultId: string;
  satzId: string;
  satzUpdatedAt: string;
  sources: ProcessingSourceRevision[];
  inserts: ReturnType<typeof mapFundstellen>;
}

export function processingSourceDigest(row: NodeDatabaseRow): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(row)
            .filter(([key]) => key !== "nodeType")
            .sort(([left], [right]) => left.localeCompare(right)),
        ),
      ),
    )
    .digest("hex");
}

async function validateSources(
  nodes: ExaminationNodes,
  projectId: string,
  projectVersion: number,
  sources: readonly ProcessingSourceRevision[],
) {
  const byType = Object.entries(groupBy(sources, ({ nodeType }) => nodeType));
  for (const [nodeType, expected] of byType) {
    const node = nodeDefinition(nodes, nodeType);
    const rows = await nodes.persistence.query((database) =>
      database
        .select(getTableColumns(node.table))
        .from(node.table)
        .where(
          and(
            inArray(
              nodeColumn(node, "id"),
              expected.map(({ id }) => id),
            ),
            eq(nodeColumn(node, "projectId"), projectId),
            eq(nodeColumn(node, "projectVersion"), projectVersion),
            eq(nodeColumn(node, "isDeleted"), false),
          ),
        ),
    );
    const current = new Map(Value.Parse(NodeDatabaseRowsSchema, rows).map((row) => [row.id, row]));
    for (const source of expected) {
      const row = current.get(source.id);
      if (
        row === undefined ||
        row.isOutdated !== source.isOutdated ||
        !(row.updatedAt instanceof Date) ||
        row.updatedAt.toISOString() !== source.updatedAt ||
        processingSourceDigest(row) !== source.digest
      ) {
        throw examinationErrors.PROCESSING_SOURCE_CHANGED({
          internal: { projectId, projectVersion, nodeType, id: source.id },
        });
      }
    }
  }
}

export function replaceAssessment(
  nodes: ExaminationNodes,
  projectId: string,
  projectVersion: number,
  input: AssessmentReplacement,
) {
  const internal = { projectId, projectVersion, satzId: input.satzId };
  return transactVersionWrite(
    { postgres: nodes.persistence, projects: nodes.versionPeer, projectId, projectVersion },
    async () => {
      const scope = { projectId, projectVersion, isDeleted: false };
      const existing = await nodes.persistence.query((query) =>
        better(query, { schema: examinationSchema }).bewertung.findFirst({
          where: { ...scope, id: input.bewertungId },
        }),
      );
      if (existing !== null) {
        if (existing.satzId !== input.satzId) {
          throw examinationErrors.PROCESSING_SOURCE_CHANGED({ internal });
        }
        return { nodesInserted: input.inserts.length };
      }
      if (
        !input.sources.some(({ nodeType }) => nodeType === "fundstelle") ||
        !input.sources.some(({ nodeType, id }) => nodeType === "satz" && id === input.satzId)
      ) {
        throw examinationErrors.PROCESSING_SOURCE_CHANGED({ internal });
      }
      await validateSources(nodes, projectId, projectVersion, input.sources);
      if (
        !input.inserts.some(
          ({ nodeType, id, payload }) =>
            nodeType === "bewertung" && id === input.bewertungId && payload.satzId === input.satzId,
        )
      ) {
        throw examinationErrors.PROCESSING_SOURCE_CHANGED({
          message: "Assessment replacement is missing its sentence result",
          internal,
        });
      }
      const stale = await nodes.persistence.query(async (query) => {
        const database = better(query, { schema: examinationSchema });
        const candidates = await database.bewertung.findMany({
          where: { ...scope, satzId: input.satzId, isOutdated: true, updateType: "AUTOMATED" },
        });
        if (candidates.length === 0) return { assessments: [], chapters: [], sources: [] };
        const candidateIds = candidates.map(({ id }) => id);
        const [chapters, sources, markdown] = await Promise.all([
          database.bewertungKapitel.findMany({
            where: { ...scope, bewertungId: { in: candidateIds } },
          }),
          database.bewertungQuelle.findMany({
            where: { ...scope, bewertungId: { in: candidateIds } },
          }),
          database.markdownText.findMany({
            where: { ...scope, id: { in: candidates.map(({ markdownTextId }) => markdownTextId) } },
          }),
        ]);
        const assessments = candidates.filter(
          (row) =>
            markdown.some(
              (text) => text.id === row.markdownTextId && text.updateType === "AUTOMATED",
            ) &&
            ![...chapters, ...sources].some(
              (child) => child.bewertungId === row.id && child.updateType !== "AUTOMATED",
            ),
        );
        const ids = new Set(assessments.map(({ id }) => id));
        return {
          assessments,
          chapters: chapters.filter(({ bewertungId }) => ids.has(bewertungId)),
          sources: sources.filter(({ bewertungId }) => ids.has(bewertungId)),
        };
      });
      const result = await executeNodeMutation(
        nodes,
        trustedServiceAuthorization,
        projectId,
        projectVersion,
        {
          inserts: input.inserts,
          deletes: [
            ...stale.assessments.flatMap(({ id, markdownTextId }) => [
              { nodeType: "bewertung", id },
              { nodeType: "markdown_text", id: markdownTextId },
            ]),
            ...stale.chapters.map(({ id }) => ({ nodeType: "bewertung_kapitel", id })),
            ...stale.sources.map(({ id }) => ({ nodeType: "bewertung_quelle", id })),
          ],
        },
      );
      if (result.isErr()) throw result.error;
      return { nodesInserted: result.value.inserted.length };
    },
  );
}

export function replaceFundstellen(
  nodes: ExaminationNodes,
  projectId: string,
  projectVersion: number,
  input: FundstellenReplacement,
) {
  const internal = { projectId, projectVersion, satzId: input.satzId };
  return transactVersionWrite(
    { postgres: nodes.persistence, projects: nodes.versionPeer, projectId, projectVersion },
    async () => {
      const scope = { projectId, projectVersion, isDeleted: false };
      const sentence = await nodes.persistence.query((query) =>
        better(query, { schema: examinationSchema }).satz.findFirst({
          where: { ...scope, id: input.satzId },
        }),
      );
      if (sentence === null) throw examinationErrors.PROCESSING_SOURCE_CHANGED({ internal });
      if (sentence.lastSuzResultId === input.resultId) {
        return { fundstellenInserted: input.inserts.length };
      }
      if (
        !input.sources.some(({ nodeType, id }) => nodeType === "satz" && id === input.satzId) ||
        sentence.updatedAt.toISOString() !== input.satzUpdatedAt
      ) {
        throw examinationErrors.PROCESSING_SOURCE_CHANGED({ internal });
      }
      const admittedDocumentIds = new Set(
        input.sources.filter(({ nodeType }) => nodeType === "dokument").map(({ id }) => id),
      );
      const { documents, norm } = await nodes.persistence.query(async (query) => {
        const database = better(query, { schema: examinationSchema });
        const paragraph = await database.absatz.findFirst({
          where: { ...scope, id: sentence.absatzId },
        });
        return {
          documents: await database.dokument.findMany({ where: scope, select: { id: true } }),
          norm:
            paragraph === null
              ? null
              : await database.norm.findFirst({ where: { ...scope, id: paragraph.normId } }),
        };
      });
      if (
        norm === null ||
        documents.length !== admittedDocumentIds.size ||
        documents.some(({ id }) => !admittedDocumentIds.has(id)) ||
        input.inserts.some(
          ({ payload }) =>
            payload.satzId !== input.satzId ||
            !payload.sourceNodeId ||
            payload.normId !== norm.id ||
            payload.gesetzId !== norm.gesetzId ||
            !admittedDocumentIds.has(payload.dokumentId),
        )
      ) {
        throw examinationErrors.PROCESSING_SOURCE_CHANGED({ internal });
      }
      await validateSources(nodes, projectId, projectVersion, input.sources);
      const prior = await nodes.persistence.query((query) =>
        better(query, { schema: examinationSchema }).fundstelle.findMany({
          where: { ...scope, satzId: input.satzId },
        }),
      );
      const generated = prior.filter(
        ({ updateType, sourceNodeId }) => updateType === "AUTOMATED" && sourceNodeId !== null,
      );
      const admittedCitationIds = new Set(
        input.sources.filter(({ nodeType }) => nodeType === "fundstelle").map(({ id }) => id),
      );
      if (generated.some(({ id }) => !admittedCitationIds.has(id))) {
        throw examinationErrors.PROCESSING_SOURCE_CHANGED({ internal });
      }
      const retained = new Set<string>();
      const incoming = new Set<string>();
      const inserts: typeof input.inserts = [];
      const updates: NonNullable<NodeMutationInput["updates"]>[number][] = [];
      for (const insert of input.inserts) {
        const identity = JSON.stringify([
          insert.payload.dokumentId,
          insert.payload.sourceNodeId,
          insert.payload.title,
          insert.payload.text,
          insert.payload.chunkIds,
          insert.payload.pageNumbers,
        ]);
        if (incoming.has(identity)) continue;
        incoming.add(identity);
        const same = prior.find(
          (row) =>
            JSON.stringify([
              row.dokumentId,
              row.sourceNodeId,
              row.title,
              row.text,
              row.chunkIds,
              row.pageNumbers,
            ]) === identity,
        );
        if (same === undefined) {
          inserts.push(insert);
          continue;
        }
        if (same.updateType !== "AUTOMATED") {
          throw examinationErrors.PROCESSING_SOURCE_CHANGED({ internal });
        }
        retained.add(same.id);
        if (
          same.isOutdated ||
          same.confidence !== insert.payload.confidence ||
          same.consensusRatio !== insert.payload.consensusRatio ||
          same.relevance !== insert.payload.relevance
        ) {
          updates.push({
            nodeType: "fundstelle",
            id: same.id,
            payload: {
              isOutdated: false,
              confidence: insert.payload.confidence,
              consensusRatio: insert.payload.consensusRatio,
              relevance: insert.payload.relevance,
            },
          });
        }
      }
      const result = await executeNodeMutation(
        nodes,
        trustedServiceAuthorization,
        projectId,
        projectVersion,
        {
          inserts: inserts.map((insert) => ({
            ...insert,
            payload: omit(insert.payload, ["sourceNodeId"]),
          })),
          updates,
          deletes: generated
            .filter(({ id }) => !retained.has(id))
            .map(({ id }) => ({ nodeType: "fundstelle", id })),
        },
      );
      if (result.isErr()) throw result.error;
      await nodes.persistence.query(async (query) => {
        const database = better(query, { schema: examinationSchema });
        for (const { id, payload } of inserts) {
          await database.fundstelle.updateMany({
            where: { ...scope, id },
            data: { sourceNodeId: payload.sourceNodeId },
          });
        }
        await database.satz.updateMany({
          where: { ...scope, id: input.satzId },
          data: { lastSuzResultId: input.resultId, updatedAt: new Date() },
        });
      });
      return { fundstellenInserted: input.inserts.length };
    },
  );
}
