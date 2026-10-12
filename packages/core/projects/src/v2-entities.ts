import {
  createNodeEntityResourceRoutes,
  defineNodeEntities,
  nodeV2AuthPolicies,
  type NodeEntityService,
  type NodeRuntime,
} from "@spark-workflow/node-crud";
import type { TSchema } from "@sinclair/typebox";

import { projectLogicSchema } from "./db/schema.ts";
import { projectNodeDescriptor, ProjectNodes } from "./runtime.ts";
import { CreateDeadlineCommandSchema, UpdateDeadlineSchema } from "./schemas.ts";
import { executeProjectV2Mutation, type ProjectV2Mutation } from "./v2-mutations.ts";

type ProjectNodeType = ProjectV2Mutation["nodeType"];

const mutations = (nodeType: ProjectNodeType) =>
  ({ node }: { readonly node: NodeRuntime<typeof projectLogicSchema> }) =>
    ({
      create: ({ auth, projectId, projectVersion, body }) =>
        executeProjectV2Mutation(node, auth, projectId, projectVersion, {
          action: "create",
          nodeType,
          body,
        }),
      update: ({ auth, projectId, projectVersion, id, body }) =>
        executeProjectV2Mutation(node, auth, projectId, projectVersion, {
          action: "update",
          nodeType,
          id,
          body,
        }),
      delete: ({ auth, projectId, projectVersion, id }) =>
        executeProjectV2Mutation(node, auth, projectId, projectVersion, {
          action: "delete",
          nodeType,
          id,
        }),
    }) satisfies Partial<Pick<NodeEntityService, "create" | "update" | "delete">>;

const operations = (body: Readonly<{ create?: TSchema; update?: TSchema }> = {}) => ({
  create: { body: body.create },
  update: { body: body.update },
  delete: {},
});

export const projectEntities = defineNodeEntities({
  id: "core/projects",
  controller: "core.projects.v2-entities",
  descriptor: projectNodeDescriptor,
  nodes: ProjectNodes,
  needs: {},
  entities: [
    {
      nodeType: "deadline",
      collection: "deadlines",
      auth: nodeV2AuthPolicies,
      operations: operations({
        create: CreateDeadlineCommandSchema,
        update: UpdateDeadlineSchema,
      }),
      mutations: mutations("deadline"),
    },
    {
      nodeType: "topic",
      collection: "topics",
      auth: nodeV2AuthPolicies,
      operations: operations(),
      mutations: mutations("topic"),
    },
    {
      nodeType: "subtopic",
      collection: "subtopics",
      auth: nodeV2AuthPolicies,
      operations: operations(),
      mutations: mutations("subtopic"),
    },
    {
      nodeType: "topic_norm",
      collection: "topic-norms",
      auth: nodeV2AuthPolicies,
      operations: operations(),
      mutations: mutations("topic_norm"),
    },
  ],
});

export { createNodeEntityResourceRoutes };
