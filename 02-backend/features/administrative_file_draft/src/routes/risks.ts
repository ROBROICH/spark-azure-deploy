import type { AuthPolicy } from "@spark-workflow/authentification";
import { recordAuditEntries, recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import type { FeatureHttp } from "@spark-workflow/http-host";
import { transactVersionWrite } from "@spark-workflow/node-crud";
import { extractPostgresDriverErrorFacts } from "@spark-workflow/postgres-runtime";
import { Type, type Static } from "@sinclair/typebox";
import { better } from "better-drizzle";
import { status } from "elysia";

import { afdSchema } from "../db/schema.ts";
import { administrativeFileDraftErrors } from "../errors";
import type { feature } from "../manifest.ts";
import {
  CreateRisksSchema,
  RiskListSchema,
  RiskResponseSchema,
  RiskStatusSchema,
  UpdateRiskSchema,
  UuidSchema,
} from "../schemas";
import { listRisks, riskResponse, riskSelect } from "../versioning.ts";

const servicePolicy = { roles: ["admin", "service"] } satisfies AuthPolicy;
const projectParams = Type.Object({ projectId: UuidSchema }, { additionalProperties: false });
const riskParams = Type.Object({ riskId: UuidSchema }, { additionalProperties: false });
const riskStatusDatabase = {
  open: "OPEN",
  corrected: "CORRECTED",
  ignored: "IGNORED",
} satisfies Record<
  Static<typeof RiskStatusSchema>,
  (typeof afdSchema.risks.$inferInsert)["status"]
>;

export const createRiskRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("administrative-file-draft.routes.risks")
    .model({ RiskResponse: RiskResponseSchema })
    .get(
      "/risks/:projectId",
      ({ params, postgres, projectVersion }) =>
        listRisks(postgres, params.projectId, projectVersion),
      {
        params: projectParams,
        response: RiskListSchema,
        auth: servicePolicy,
        latestProjectVersion: true,
        detail: { operationId: "listRisks" },
      },
    )
    .post(
      "/risks/:projectId",
      async ({ params, body, postgres, projects, projectVersion }) => {
        if (body.risks.length === 0) return status(201, []);
        try {
          const rows = await transactVersionWrite(
            { postgres, projects, projectId: params.projectId, projectVersion },
            async () => {
              return postgres.query(async (query) => {
                const created = await better(query, { schema: afdSchema }).risks.createMany({
                  select: riskSelect,
                  data: body.risks.map((input): typeof afdSchema.risks.$inferInsert => ({
                    id: crypto.randomUUID(),
                    projectId: params.projectId,
                    projectVersion,
                    vaeNodeId: input.vaeNodeId,
                    problem: input.problem,
                    recommendation: input.recommendation ?? null,
                    quote: input.quote ?? null,
                    severity: input.severity,
                    status: "OPEN",
                    implication: input.implication,
                    frontendParentIds: [],
                    updateType: "AUTOMATED",
                  })),
                });
                await recordAuditEntries(query, {
                  projectId: params.projectId,
                  entries: (created.data ?? []).map(({ id }) => ({
                    entityType: "risks",
                    entityId: id,
                    changeType: "create",
                  })),
                });
                return created;
              });
            },
          );
          return status(201, (rows.data ?? []).map(riskResponse));
        } catch (error) {
          if (extractPostgresDriverErrorFacts(error).constraint === "risks_vae_node_project_fkey") {
            throw administrativeFileDraftErrors.INVALID_VAE_NODE({
              cause: error instanceof Error ? error : undefined,
            });
          }
          throw error;
        }
      },
      {
        params: projectParams,
        body: CreateRisksSchema,
        response: { 201: RiskListSchema },
        auth: servicePolicy,
        projects: true,
        latestProjectVersion: true,
        detail: { operationId: "createRisks" },
      },
    )
    .patch(
      "/risks/:riskId",
      async ({ params, body, postgres, projects }) => {
        const latest = await postgres.query(async (query) =>
          better(query, { schema: afdSchema }).risks.findFirst({
            select: { projectId: true },
            where: { id: params.riskId },
            orderBy: { projectVersion: "desc" },
          }),
        );
        if (latest === null) {
          throw administrativeFileDraftErrors.RISK_NOT_FOUND({
            internal: { riskId: params.riskId },
          });
        }
        try {
          const version = await projects.resolveLatestVersion(latest.projectId);
          if (version.isErr()) throw version.error;
          const projectVersion = version.value;
          const row = await transactVersionWrite(
            { postgres, projects, projectId: latest.projectId, projectVersion },
            async () => {
              return postgres.query(async (query) => {
                const updated = await better(query, { schema: afdSchema }).risks.update({
                  select: riskSelect,
                  where: {
                    id: params.riskId,
                    projectVersion,
                    isDeleted: false,
                  },
                  data: {
                    problem: body.problem,
                    recommendation: body.recommendation,
                    quote: body.quote,
                    severity: body.severity,
                    implication: body.implication,
                    status: body.status === undefined ? undefined : riskStatusDatabase[body.status],
                    vaeNodeId: body.vaeNodeId,
                  },
                });
                if (updated === null) {
                  throw administrativeFileDraftErrors.RISK_NOT_FOUND({
                    internal: { riskId: params.riskId, projectId: latest.projectId },
                  });
                }
                await recordAuditEntry(query, {
                  projectId: latest.projectId,
                  entityType: "risks",
                  entityId: params.riskId,
                  changeType: "update",
                });
                return updated;
              });
            },
          );
          return riskResponse(row);
        } catch (error) {
          if (extractPostgresDriverErrorFacts(error).constraint === "risks_vae_node_project_fkey") {
            throw administrativeFileDraftErrors.INVALID_VAE_NODE({
              cause: error instanceof Error ? error : undefined,
            });
          }
          throw error;
        }
      },
      {
        params: riskParams,
        body: UpdateRiskSchema,
        response: RiskResponseSchema,
        auth: servicePolicy,
        projects: true,
        detail: { operationId: "updateRisk" },
      },
    );
