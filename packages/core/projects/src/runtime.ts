import {
  bindNodeRuntime,
  createNodeVersionService,
  createNodeBatchReader,
  type NodeRuntime,
} from "@spark-workflow/node-crud";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { defineResource, provide } from "@spark-workflow/resource";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Result } from "better-result";
import { inArray, sql } from "drizzle-orm";

import { createUsecasesService, Usecases } from "../../usecases/src/resource.ts";
import { projectLogicModels } from "./db.ts";
import { projectLogicSchema, projectLogicNodeTables } from "./db/schema.ts";
import { projectErrors } from "./errors.ts";
import { createProjectLogicNodeDescriptor } from "./node/descriptor.ts";
import { ProjectVersions } from "./project-versions.ts";
import {
  createProjectsService,
  ProjectCommandConfiguration,
  ProjectLogicVersioning,
  Projects,
  ProjectTemporalCommands,
} from "./resource.ts";
import { ProjectTemporalCommandsService } from "./temporal/commands.ts";

export const projectNodeDescriptor = createProjectLogicNodeDescriptor();

const TopicEdgeSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  parentTopicId: Type.Union([Type.String(), Type.Null()]),
});
const ParentTopicIdSchema = Type.String();
const DeadlineDatesSchema = Type.Object({
  startAt: Type.String({ format: "date" }),
  endAt: Type.String({ format: "date" }),
});
const ReferencedSchema = Type.Tuple([Type.Object({ referenced: Type.Boolean() })]);

export const projectTemporalCommandsProvider = provide({
  resource: ProjectTemporalCommands,
  needs: { configuration: ProjectCommandConfiguration },
  make: ({ configuration }) => new ProjectTemporalCommandsService(configuration),
  release: (commands) => commands.close(),
});

export const ProjectNodes = defineResource<NodeRuntime<typeof projectLogicSchema>>()(
  "core/ProjectNodes",
);

export const projectNodesProvider = provide({
  resource: ProjectNodes,
  needs: { postgres: PostgreSQL },
  make: ({ postgres }) => {
    const scope = postgres.scope(projectLogicSchema);
    return bindNodeRuntime(projectNodeDescriptor, {
      persistence: scope,
      versionPeer: new ProjectVersions(scope),
      prepareMutation: async (projectId, projectVersion, mutation) => {
        const where = { projectId, projectVersion, isDeleted: false };
        const writes = [...mutation.inserts, ...mutation.updates];
        const deletedTopics = new Set(
          mutation.deletes.filter(({ nodeType }) => nodeType === "topic").map(({ id }) => id),
        );
        const deletedSubtopics = mutation.deletes
          .filter(({ nodeType }) => nodeType === "subtopic")
          .map(({ id }) => id);
        if (deletedTopics.size > 0 || deletedSubtopics.length > 0) {
          const topicIds = [...deletedTopics];
          const [{ referenced }] = Value.Parse(
            ReferencedSchema,
            await scope.query((database) =>
              database.execute(sql`
                SELECT EXISTS (
                  SELECT 1 FROM file_topic
                  WHERE project_id = ${projectId}::uuid
                    AND project_version = ${projectVersion}
                    AND is_deleted IS FALSE
                    AND (${inArray(sql`topic_id`, topicIds)}
                      OR ${inArray(sql`subtopic_id`, deletedSubtopics)})
                ) OR EXISTS (
                  SELECT 1 FROM vae_node
                  WHERE project_id = ${projectId}::uuid
                    AND project_version = ${projectVersion}
                    AND is_deleted IS FALSE
                    AND (${inArray(sql`topic_id`, topicIds)}
                      OR ${inArray(sql`subtopic_id`, deletedSubtopics)})
                ) OR EXISTS (
                  SELECT 1 FROM argument
                  WHERE project_id = ${projectId}::uuid
                    AND project_version = ${projectVersion}
                    AND is_deleted IS FALSE
                    AND (${inArray(sql`topic_id`, topicIds)}
                      OR ${inArray(sql`sub_topic_id`, deletedSubtopics)})
                ) AS referenced
              `),
            ),
          );
          if (referenced) {
            return Result.err(
              projectErrors.CONFLICT({
                message: "Topic still has active document, decision or objection references",
              }),
            );
          }
        }
        if (
          writes.some(({ nodeType }) => ["topic", "subtopic", "topic_norm"].includes(nodeType)) ||
          deletedTopics.size > 0
        ) {
          const storedTopics = await scope.query((database) =>
            projectLogicModels(database).topics.findMany({
              select: { id: true, name: true, parentTopicId: true },
              where,
            }),
          );
          const graph = new Map(storedTopics.map((row) => [row.id, row]));
          const changedTopics = new Set<string>();
          for (const item of mutation.inserts) {
            if (item.nodeType !== "topic") continue;
            graph.set(
              item.id,
              Value.Parse(TopicEdgeSchema, { parentTopicId: null, ...item.payload, id: item.id }),
            );
            changedTopics.add(item.id);
          }
          for (const item of mutation.updates) {
            if (item.nodeType !== "topic") continue;
            const current = graph.get(item.id);
            if (current === undefined) {
              return Result.err(projectErrors.NOT_FOUND({ message: `Topic ${item.id} not found` }));
            }
            graph.set(
              item.id,
              Value.Parse(TopicEdgeSchema, { ...current, ...item.payload, id: item.id }),
            );
            changedTopics.add(item.id);
          }
          for (const id of deletedTopics) graph.delete(id);
          for (const id of changedTopics) {
            const row = graph.get(id);
            if (row === undefined) continue;
            for (const other of graph.values()) {
              if (
                other.id !== id &&
                other.parentTopicId === row.parentTopicId &&
                other.name === row.name
              ) {
                return Result.err(
                  projectErrors.CONFLICT({
                    message: `Topic with name '${row.name}' already exists`,
                  }),
                );
              }
            }
            const visited = new Set([id]);
            let parentId = row.parentTopicId;
            while (parentId !== null) {
              if (visited.has(parentId)) {
                return Result.err(
                  projectErrors.INVALID_REQUEST({
                    message: "Topic hierarchy must not contain a cycle",
                  }),
                );
              }
              visited.add(parentId);
              const parent = graph.get(parentId);
              if (parent === undefined) {
                return Result.err(
                  projectErrors.NOT_FOUND({ message: `Topic ${parentId} not found` }),
                );
              }
              parentId = parent.parentTopicId;
            }
          }
          if (
            [...graph.values()].some(
              ({ parentTopicId }) => parentTopicId !== null && deletedTopics.has(parentTopicId),
            )
          ) {
            return Result.err(
              projectErrors.CONFLICT({ message: "Topic still has active dependent topics" }),
            );
          }
          for (const nodeType of ["subtopic", "topic_norm"] as const) {
            const related = writes.filter((item) => item.nodeType === nodeType);
            if (related.length === 0 && deletedTopics.size === 0) continue;
            const rows = await scope.query((database) =>
              nodeType === "subtopic"
                ? projectLogicModels(database).subtopics.findMany({
                    select: { id: true, topicId: true },
                    where,
                  })
                : projectLogicModels(database).topicNorms.findMany({
                    select: { id: true, topicId: true },
                    where,
                  }),
            );
            const parents = new Map(rows.map(({ id, topicId }) => [id, topicId]));
            for (const item of related) {
              const parentId = item.payload.topicId ?? parents.get(item.id);
              if (!Value.Check(ParentTopicIdSchema, parentId) || !graph.has(parentId)) {
                return Result.err(
                  projectErrors.NOT_FOUND({
                    message: "Active parent topic not found in this project version",
                  }),
                );
              }
              parents.set(item.id, parentId);
            }
            for (const item of mutation.deletes) {
              if (item.nodeType === nodeType) parents.delete(item.id);
            }
            if ([...parents.values()].some((id) => deletedTopics.has(id))) {
              return Result.err(
                projectErrors.CONFLICT({ message: "Topic still has active dependents" }),
              );
            }
          }
        }
        const deadlineUpdates = mutation.updates.filter(({ nodeType }) => nodeType === "deadline");
        const storedDeadlines =
          deadlineUpdates.length === 0
            ? []
            : await scope.query((database) =>
                projectLogicModels(database).deadlines.findMany({
                  select: { id: true, startAt: true, endAt: true },
                  where: { ...where, id: { in: deadlineUpdates.map(({ id }) => id) } },
                }),
              );
        const currentDeadlines = new Map(storedDeadlines.map((row) => [row.id, row]));
        for (const item of writes) {
          if (item.nodeType !== "deadline") continue;
          const current = currentDeadlines.get(item.id);
          const dates = {
            startAt: item.payload.startAt === undefined ? current?.startAt : item.payload.startAt,
            endAt: item.payload.endAt === undefined ? current?.endAt : item.payload.endAt,
          };
          if (!Value.Check(DeadlineDatesSchema, dates)) {
            return Result.err(
              projectErrors.INVALID_REQUEST({ message: "Deadlines require startAt and endAt" }),
            );
          }
          if (dates.startAt > dates.endAt) {
            return Result.err(
              projectErrors.INVALID_REQUEST({
                message: "startAt must be less than or equal to endAt",
              }),
            );
          }
        }
        return Result.ok(mutation);
      },
    });
  },
});

export const projectsProvider = provide({
  resource: Projects,
  needs: { postgres: PostgreSQL, nodes: ProjectNodes },
  make: ({ postgres, nodes }) => {
    const scope = postgres.scope(projectLogicSchema);
    return createProjectsService(scope, nodes, new ProjectVersions(scope));
  },
});

export const usecasesProvider = provide({
  resource: Usecases,
  needs: { postgres: PostgreSQL },
  make: ({ postgres }) => createUsecasesService(postgres.scope(projectLogicSchema)),
});

export const projectLogicVersioningProvider = provide({
  resource: ProjectLogicVersioning,
  needs: { nodes: ProjectNodes },
  make: ({ nodes }) => ({
    ...createNodeVersionService(nodes),
    batchNodes: createNodeBatchReader(nodes, projectLogicNodeTables),
  }),
});
