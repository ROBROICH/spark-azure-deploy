import type { AuthPolicy } from "@spark-workflow/authentification";
import { createController } from "@spark-workflow/http-host";
import { Type as T } from "@sinclair/typebox";
import { t } from "elysia";

import { protocolErrors } from "../errors.ts";
import type { ProtocolHistory } from "../runtime.ts";
import {
  HistoryItemSchema,
  HistoryResponseSchema,
  type HistoryQuery,
  type HistorySourceFilter,
} from "../history/types.ts";

const HistoryDateInputSchema = T.Union([
  T.String({ format: "date" }),
  T.String({ format: "date-time" }),
]);
const SourceFilterSchema = T.Union([T.Literal("user"), T.Literal("agent"), T.Literal("all")]);
const ProjectParamsSchema = T.Object(
  { projectId: T.String({ format: "uuid" }) },
  { additionalProperties: false },
);
const EXPORT_LIMIT = 10_000;
const commonQuery = {
  from: T.Optional(HistoryDateInputSchema),
  to: T.Optional(HistoryDateInputSchema),
  source: T.Optional(SourceFilterSchema),
  service: T.Optional(T.String()),
  requestId: T.Optional(T.String()),
};
const HistoryQuerySchema = T.Object(
  {
    ...commonQuery,
    workflowRunId: T.Optional(T.String()),
    ungrouped: T.Optional(t.BooleanString()),
    limit: T.Optional(t.Numeric({ minimum: 1, maximum: 500 })),
    offset: T.Optional(t.Numeric({ minimum: 0, maximum: EXPORT_LIMIT })),
  },
  { additionalProperties: false },
);
const HistoryExportQuerySchema = T.Object(commonQuery, { additionalProperties: false });

const readHistoryPolicy = {
  permissions: [{ resource: "project", permission: "audit", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;

function queryValue(
  projectId: string,
  values: {
    from?: string;
    to?: string;
    source?: HistorySourceFilter;
    service?: string;
    workflowRunId?: string;
    requestId?: string;
    ungrouped?: boolean;
    limit?: number;
    offset?: number;
  },
  options: { export: boolean },
): HistoryQuery {
  const workflowRunId = options.export ? null : (values.workflowRunId ?? null);
  const requestId = values.requestId ?? null;
  const ungrouped = options.export || values.ungrouped === true;
  return {
    projectId,
    from: values.from ?? null,
    to: values.to ?? null,
    source: values.source ?? null,
    service: values.service || null,
    workflowRunId,
    requestId,
    collapsed: !(ungrouped || workflowRunId !== null || requestId !== null),
    limit: options.export ? EXPORT_LIMIT : (values.limit ?? 50),
    offset: options.export ? 0 : (values.offset ?? 0),
  };
}

function streamHistoryExport(
  projectId: string,
  total: number,
  items: readonly unknown[],
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const header = `{\n  "projectId": ${JSON.stringify(projectId)},\n  "total": ${JSON.stringify(total)},\n  "items": `;
  let cursor = -1;
  return new ReadableStream<Uint8Array>({
    pull(controller): void {
      if (cursor === -1) {
        controller.enqueue(encoder.encode(items.length === 0 ? `${header}[]\n}` : `${header}[\n`));
        if (items.length === 0) {
          controller.close();
          return;
        }
        cursor = 0;
        return;
      }
      if (cursor >= items.length) {
        controller.enqueue(encoder.encode("  ]\n}"));
        controller.close();
        return;
      }
      const rendered = JSON.stringify(items[cursor], null, 2).replace(/\n/g, "\n    ");
      const suffix = cursor === items.length - 1 ? "\n" : ",\n";
      controller.enqueue(encoder.encode(`    ${rendered}${suffix}`));
      cursor += 1;
    },
  });
}

export function createHistoryRoutes(protocolHistory: ProtocolHistory) {
  return createController("protocol-service.routes.history")
    .decorate({ protocolHistory })
    .model({
      HistoryItem: HistoryItemSchema,
      HistoryResponse: HistoryResponseSchema,
      SourceFilter: SourceFilterSchema,
    })
    .group("/projects/:projectId/history", (app) =>
      app
        .get(
          "",
          ({ params, query, protocolHistory }) =>
            protocolHistory.read(queryValue(params.projectId, query, { export: false })),
          {
            params: ProjectParamsSchema,
            query: HistoryQuerySchema,
            response: HistoryResponseSchema,
            auth: readHistoryPolicy,
            protocolHistory: true,
            detail: { operationId: "getProjectHistory" },
          },
        )
        .get(
          "/export",
          async ({ params, query, protocolHistory }) => {
            const history = await protocolHistory.read(
              queryValue(params.projectId, query, { export: true }),
            );
            if (history.total > EXPORT_LIMIT) {
              throw protocolErrors.EXPORT_LIMIT_EXCEEDED({
                total: history.total,
                limit: EXPORT_LIMIT,
              });
            }
            return new Response(
              streamHistoryExport(params.projectId, history.total, history.items),
              {
                headers: {
                  "content-type": "application/json",
                  "content-disposition": 'attachment; filename="history.json"',
                },
              },
            );
          },
          {
            params: ProjectParamsSchema,
            query: HistoryExportQuerySchema,
            response: T.String(),
            auth: readHistoryPolicy,
            protocolHistory: true,
            detail: { operationId: "exportProjectHistory" },
          },
        ),
    );
}
