import { currentAuditContext, type AuditContext } from "@spark-workflow/audit-client";
import { recordAuditEntries } from "@spark-workflow/audit-client/persistence";
import { Projects, type ProjectsService } from "@spark-workflow/core/projects/resource";
import type { Usecase } from "@spark-workflow/core/usecases/formats";
import { Usecases } from "@spark-workflow/core/usecases/resource";
import {
  createNodeVersionService,
  createNodeBatchReader,
  type NodeBatchReader,
  mutateNodes,
  trustedServiceAuthorization,
  type NodeMutationInput,
  type NodeMutationResult,
  type NodeVersionService,
  transactVersionWrite,
} from "@spark-workflow/node-crud";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { defineResource, provide } from "@spark-workflow/resource";
import type { Static } from "@sinclair/typebox";
import { better, type SelectInput } from "better-drizzle";

import { afdSchema, type risks } from "./db/schema";
import { administrativeFileDraftErrors } from "./errors";
import { AdministrativeFileDraftNodes, validateChapterParents } from "./node/descriptor.ts";
import type { RiskStatusSchema } from "./schemas";

interface TemplateTopic {
  readonly id: string;
  readonly name: string;
}

const nodeTables = { risks: afdSchema.risks, vaeNodes: afdSchema.vaeNodes };

export type RiskInsertPayload = Omit<
  typeof risks.$inferInsert,
  | "id"
  | "projectId"
  | "projectVersion"
  | "createdAt"
  | "updatedAt"
  | "isDeleted"
  | "sysPeriod"
  | "status"
  | "updateType"
> & {
  status: Lowercase<typeof risks.$inferInsert.status>;
  updateType?: "automated" | "manual" | null;
};

export type RiskMutationInput = Omit<NodeMutationInput, "inserts"> & {
  inserts?: readonly { nodeType: "risks"; id?: string; payload: RiskInsertPayload }[];
};

export interface AdministrativeFileDraftVersioningService extends NodeVersionService {
  batchNodes: NodeBatchReader<typeof nodeTables>;
  assignTemplate(
    projectId: string,
    projectTypeId: string,
    topics: readonly TemplateTopic[],
    projectVersion: number,
  ): Promise<void>;
  getRisks(
    projectId: string,
    projectVersion: number,
  ): Promise<
    readonly {
      readonly id: string;
      readonly vaeNodeId: string;
      readonly status: "open" | "corrected" | "ignored";
    }[]
  >;
  updateNodes(
    projectId: string,
    projectVersion: number,
    input: RiskMutationInput,
  ): Promise<NodeMutationResult>;
}

export const AdministrativeFileDraftVersioning =
  defineResource<AdministrativeFileDraftVersioningService>()(
    "administrative-file-draft/Versioning",
  );

export const assignTemplate = async (
  postgres: PostgresScope<typeof afdSchema>,
  projects: Pick<ProjectsService, "validateWriteVersion" | "batchNodes">,
  projectId: string,
  projectVersion: number,
  nodes: Usecase["beschluss"]["nodes"],
  topics: readonly TemplateTopic[],
  auditContext: AuditContext,
) => {
  await transactVersionWrite({ postgres, projects, projectId, projectVersion }, async () => {
    await postgres.query(async (query) => {
      const transaction = better(query, { schema: afdSchema });
      const existing = await transaction.vaeNodes.findFirst({
        select: { id: true },
        where: { projectId, projectVersion, isDeleted: false },
      });
      if (existing !== null) return;
      const ordered = [...nodes].sort(
        (left, right) => left.order - right.order || left.id.localeCompare(right.id),
      );
      const ids = new Map(ordered.map(({ id }) => [id, Bun.randomUUIDv7()]));
      const topicIds = new Map(topics.map(({ id, name }) => [name.toLowerCase(), id]));
      for (const node of ordered) {
        if (node.topic !== null && !topicIds.has(node.topic.toLowerCase())) {
          throw administrativeFileDraftErrors.INVALID_TOPIC({
            message: `Unknown topic '${node.topic}'`,
          });
        }
      }
      const values = ordered.map(
        (node) =>
          ({
            id: ids.get(node.id)!,
            projectId,
            projectVersion,
            parentVaeNodeId:
              node.parent_vae_node_id === null ? null : (ids.get(node.parent_vae_node_id) ?? null),
            assignee: null,
            checkedByAssignee: false,
            checkedByLeader: false,
            checkedAtAssignee: null,
            checkedAtLeader: null,
            topicId: node.topic === null ? null : topicIds.get(node.topic.toLowerCase())!,
            subtopicId: null,
            templateId: null,
            title: node.title,
            text: node.text,
            order: node.order,
            canAddChild: node.can_add_child,
            isHidden: node.is_hidden,
            frontendParentIds: [],
            updateType: "AUTOMATED",
          }) satisfies typeof afdSchema.vaeNodes.$inferInsert,
      );
      if (values.length === 0) return;
      const parents = await validateChapterParents(projects, projectId, [projectVersion], values);
      if (parents.isErr()) throw parents.error;
      await transaction.vaeNodes.createMany({ data: values });
      await recordAuditEntries(query, {
        projectId,
        entries: values.map(({ id }) => ({
          entityId: id,
          entityType: "vae_node",
          changeType: "create",
        })),
        context: auditContext,
      });
    });
  });
};

const riskStatus = {
  OPEN: "open",
  CORRECTED: "corrected",
  IGNORED: "ignored",
} satisfies Record<(typeof risks.$inferSelect)["status"], Static<typeof RiskStatusSchema>>;
export const riskSelect = {
  id: true,
  projectId: true,
  problem: true,
  recommendation: true,
  quote: true,
  severity: true,
  implication: true,
  status: true,
  vaeNodeId: true,
} satisfies SelectInput<typeof afdSchema, "risks">;
type RiskResponseRow = Pick<typeof risks.$inferSelect, keyof typeof riskSelect>;

export const riskResponse = (row: RiskResponseRow) => ({
  id: row.id,
  projectId: row.projectId,
  problem: row.problem,
  recommendation: row.recommendation,
  quote: row.quote,
  severity: row.severity,
  implication: row.implication,
  status: riskStatus[row.status],
  vaeNodeId: row.vaeNodeId,
});

export async function listRisks(
  postgres: PostgresScope<typeof afdSchema>,
  projectId: string,
  projectVersion: number,
) {
  const rows = await postgres.query(async (query) =>
    better(query, { schema: afdSchema }).risks.findMany({
      select: riskSelect,
      where: { projectId, projectVersion, isDeleted: false },
      orderBy: { id: "asc" },
    }),
  );
  return rows.map(riskResponse);
}

export const administrativeFileDraftVersioningProvider = provide({
  resource: AdministrativeFileDraftVersioning,
  needs: {
    postgres: PostgreSQL,
    projects: Projects,
    usecases: Usecases,
    nodes: AdministrativeFileDraftNodes,
  },
  make: ({ postgres, projects, usecases, nodes }) => {
    const scope = postgres.scope(afdSchema);
    const nodeVersioning = createNodeVersionService(nodes);
    return Object.freeze<AdministrativeFileDraftVersioningService>({
      ...nodeVersioning,
      batchNodes: createNodeBatchReader(nodes, nodeTables),
      async assignTemplate(projectId, projectTypeId, topics, projectVersion) {
        const usecase = await usecases.getUsecase(projectTypeId);
        if (usecase.isErr()) throw usecase.error;
        await assignTemplate(
          scope,
          projects,
          projectId,
          projectVersion,
          usecase.value.beschluss.nodes,
          topics,
          currentAuditContext(),
        );
      },
      getRisks: (projectId, projectVersion) => listRisks(scope, projectId, projectVersion),
      async updateNodes(projectId, projectVersion, input) {
        const result = await mutateNodes(
          nodes,
          trustedServiceAuthorization,
          projectId,
          projectVersion,
          input,
        );
        if (result.isErr()) throw result.error;
        return result.value;
      },
    });
  },
});
