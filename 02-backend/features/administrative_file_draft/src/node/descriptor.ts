import { Projects, type ProjectsService } from "@spark-workflow/core/projects/resource";
import { isoInstant } from "@spark-workflow/http-host";
import {
  bindNodeRuntime,
  defineNodeDescriptor,
  lowerCaseEnumRule,
  type FieldAuthorizationRequest,
  type NodeFieldRule,
  type NodeRefInput,
  type NodeRuntime,
} from "@spark-workflow/node-crud";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { defineResource, provide } from "@spark-workflow/resource";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { better } from "better-drizzle";
import { Result } from "better-result";

import { afdSchema } from "../db/schema";
import { administrativeFileDraftErrors } from "../errors.ts";
import { DateTimeSchema, RiskStatusSchema } from "../schemas";

const dateRule: NodeFieldRule = {
  toDatabase: (value) => (value === null ? null : new Date(`${value}`)),
  fromDatabase: (value) => (value instanceof Date ? isoInstant(value) : value),
};

const ParentVaeNodeIdSchema = Type.Union([Type.String(), Type.Null()]);

export const ChapterParentsSchema = Type.Object({
  topicId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  subtopicId: Type.Optional(Type.Union([Type.String(), Type.Null()])),
});

const CHAPTER_PARENT_BATCH_SIZE = 32_000;

export const validateChapterParents = (
  projects: Pick<ProjectsService, "batchNodes">,
  projectId: string,
  versions: readonly number[],
  chapters: readonly Static<typeof ChapterParentsSchema>[],
) =>
  Result.gen(async function* () {
    const missing = new Map<string, NodeRefInput>();
    for (const chapter of chapters) {
      for (const [field, nodeType] of [
        ["topicId", "topic"],
        ["subtopicId", "subtopic"],
      ] as const) {
        const id = chapter[field];
        if (id !== undefined && id !== null) missing.set(`${nodeType}:${id}`, { nodeType, id });
      }
    }
    for (const version of versions) {
      if (missing.size === 0) break;
      const refs = [...missing.values()];
      for (let offset = 0; offset < refs.length; offset += CHAPTER_PARENT_BATCH_SIZE) {
        const found = yield* Result.await(
          projects.batchNodes(
            projectId,
            version,
            refs.slice(offset, offset + CHAPTER_PARENT_BATCH_SIZE),
          ),
        );
        for (const { nodeType, id } of found) missing.delete(`${nodeType}:${id}`);
      }
    }
    if (missing.size > 0) {
      return Result.err(administrativeFileDraftErrors.INVALID_CHAPTER_PARENT());
    }
    return Result.ok(undefined);
  });

const approveRule: NodeFieldRule = {
  create: { permissions: ["approve"], ignoreValues: [false, null] },
};

export const authorizeAdministrativeFileDraftFields = (request: FieldAuthorizationRequest) =>
  request.auth.authorize(
    request.checks.flatMap(({ permissions }) =>
      permissions.map((permission) => ({
        resource: "project",
        resourceId: request.projectId,
        permission,
      })),
    ),
    { bypassRoles: ["admin", "service"] },
  );

export const administrativeFileDraftDescriptor = defineNodeDescriptor({
  name: "administrative-file-draft",
  auditLogEnabled: true,
  schema: afdSchema,
  nodeMetadata: {
    risks: {
      fieldRules: { status: lowerCaseEnumRule },
      schemaOverrides: {
        response: { status: RiskStatusSchema },
        insert: { status: RiskStatusSchema },
        patch: { status: Type.Optional(RiskStatusSchema) },
      },
    },
    vaeNodes: {
      externalParents: [
        {
          kind: "external",
          field: "topicId",
          nodeType: "topic",
          service: "projectLogicService",
        },
        {
          kind: "external",
          field: "subtopicId",
          nodeType: "subtopic",
          service: "projectLogicService",
        },
      ],
      fieldRules: {
        checkedAtAssignee: dateRule,
        checkedAtLeader: { ...dateRule, ...approveRule },
        checkedByLeader: approveRule,
      },
      schemaOverrides: {
        response: {
          checkedAtAssignee: Type.Union([DateTimeSchema, Type.Null()]),
          checkedAtLeader: Type.Union([DateTimeSchema, Type.Null()]),
        },
        insert: {
          checkedAtAssignee: Type.Optional(Type.Union([DateTimeSchema, Type.Null()])),
          checkedAtLeader: Type.Optional(Type.Union([DateTimeSchema, Type.Null()])),
        },
        patch: {
          checkedAtAssignee: Type.Optional(Type.Union([DateTimeSchema, Type.Null()])),
          checkedAtLeader: Type.Optional(Type.Union([DateTimeSchema, Type.Null()])),
        },
      },
    },
  },
});

export const AdministrativeFileDraftNodes = defineResource<NodeRuntime<typeof afdSchema>>()(
  "administrative-file-draft/Nodes",
);

export const administrativeFileDraftNodesProvider = provide({
  resource: AdministrativeFileDraftNodes,
  needs: { postgres: PostgreSQL, projects: Projects },
  make: ({ postgres, projects }) => {
    const persistence = postgres.scope(afdSchema);
    return bindNodeRuntime(administrativeFileDraftDescriptor, {
      persistence,
      versionPeer: projects,
      authorizeFields: authorizeAdministrativeFileDraftFields,
      validateCopy: ({ projectId, sourceVersion, targetVersion, dryRun, nodes }) =>
        validateChapterParents(
          projects,
          projectId,
          dryRun ? [targetVersion, sourceVersion] : [targetVersion],
          nodes
            .filter(({ nodeType }) => nodeType === "vae_node")
            .flatMap(({ rows }) => rows.map((row) => Value.Parse(ChapterParentsSchema, row))),
        ),
      prepareMutation: (projectId, projectVersion, mutation, auth) =>
        Result.gen(async function* () {
          yield* Result.await(
            validateChapterParents(
              projects,
              projectId,
              [projectVersion],
              [...mutation.inserts, ...mutation.updates]
                .filter(({ nodeType }) => nodeType === "vae_node")
                .map(({ payload }) => Value.Parse(ChapterParentsSchema, payload)),
            ),
          );
          const reparented = [...mutation.inserts, ...mutation.updates].filter(
            ({ nodeType, payload }) =>
              nodeType === "vae_node" && Object.hasOwn(payload, "parentVaeNodeId"),
          );
          const transitions = mutation.updates.filter(
            ({ nodeType, payload }) =>
              nodeType === "vae_node" &&
              (payload.checkedByAssignee === false ||
                payload.checkedByLeader !== undefined ||
                payload.checkedAtLeader !== undefined),
          );
          if (reparented.length === 0 && transitions.length === 0) return Result.ok(mutation);
          const rows = await persistence.query((query) =>
            better(query, { schema: afdSchema }).vaeNodes.findMany({
              select: { id: true, parentVaeNodeId: true, checkedByAssignee: true },
              where: { projectId, projectVersion, isDeleted: false },
            }),
          );
          const completed = new Set(
            rows.filter(({ checkedByAssignee }) => checkedByAssignee).map(({ id }) => id),
          );
          const withdrawals = new Set(
            transitions
              .filter(
                ({ id, payload }) =>
                  completed.has(id) &&
                  payload.checkedByAssignee === false &&
                  (payload.checkedByLeader === undefined || payload.checkedByLeader === false) &&
                  (payload.checkedAtLeader === undefined || payload.checkedAtLeader === null),
              )
              .map(({ id }) => id),
          );
          if (
            transitions.some(
              ({ id, payload }) =>
                !withdrawals.has(id) &&
                (payload.checkedByLeader !== undefined || payload.checkedAtLeader !== undefined),
            )
          ) {
            yield* Result.await(
              auth.authorize(
                [{ resource: "project", resourceId: projectId, permission: "approve" }],
                { bypassRoles: ["admin", "service"] },
              ),
            );
          }
          const parents = new Map(rows.map(({ id, parentVaeNodeId }) => [id, parentVaeNodeId]));
          for (const { id, payload } of reparented) {
            parents.set(id, Value.Parse(ParentVaeNodeIdSchema, payload.parentVaeNodeId));
          }
          for (const { nodeType, id } of mutation.deletes) {
            if (nodeType === "vae_node") parents.delete(id);
          }
          for (const { id } of reparented) {
            const visited = new Set<string>();
            let cursor: string | null | undefined = id;
            while (cursor !== null && cursor !== undefined && parents.has(cursor)) {
              if (visited.has(cursor)) {
                return Result.err(administrativeFileDraftErrors.INVALID_EXPORT_STRUCTURE());
              }
              visited.add(cursor);
              const parent = parents.get(cursor);
              if (parent === cursor) break;
              cursor = parent;
            }
          }
          return Result.ok({
            ...mutation,
            updates: mutation.updates.map((item) =>
              item.nodeType === "vae_node" && withdrawals.has(item.id)
                ? {
                    ...item,
                    payload: {
                      ...item.payload,
                      checkedByLeader: false,
                      checkedAtAssignee: null,
                      checkedAtLeader: null,
                    },
                  }
                : item,
            ),
          });
        }),
    });
  },
});
