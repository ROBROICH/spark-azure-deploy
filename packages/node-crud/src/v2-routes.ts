import type { AuthPolicy } from "@spark-workflow/authentification";
import {
  assertRestQuery,
  RestPaginationQueryProperties,
  RestQueryErrorSchema,
  parseRestPagination,
  restPageResponseSchema,
  restPaginationMetadata,
} from "@spark-workflow/http-host";
import { Type, TypeGuard, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { type AnyElysia, status, t } from "elysia";

import type {
  NodeDefinition,
  NodeDescriptor,
  NodeRuntime,
  NodeSchema,
  RequestAuthorization,
} from "./descriptor";
import { nodeDefinition } from "./descriptor";
import { NodeNotFoundError } from "./errors";
import { batchNodes, paginateNodes, transactNodeMutation, type NodeMutationInput } from "./service";
import { nodeCreatePolicy, nodeDeletePolicy, nodeUpdatePolicy } from "./routes";
import {
  NodeDatabaseValueSchema,
  type NodeBase,
  type NodeDatabaseValue,
  type NodeJson,
} from "./values";

type RuntimeContext<App extends AnyElysia> = App["~Singleton"]["decorator"] &
  App["~Singleton"]["derive"] &
  App["~Singleton"]["resolve"] &
  App["~Ephemeral"]["derive"] &
  App["~Ephemeral"]["resolve"] &
  App["~Volatile"]["derive"] &
  App["~Volatile"]["resolve"];

interface NodeEntityScope {
  readonly projectId: string;
  readonly projectVersion: number;
}

interface NodeEntityMutationScope extends NodeEntityScope {
  readonly auth: RequestAuthorization;
}

export interface NodeEntityService {
  paginate(
    input: NodeEntityScope &
      Readonly<{
        limit: number;
        offset: number;
        filters: Readonly<Record<string, readonly NodeDatabaseValue[]>>;
      }>,
  ): Promise<Readonly<{ items: readonly NodeBase[]; total: number }>>;
  findUnique(input: NodeEntityScope & Readonly<{ id: string }>): Promise<NodeBase>;
  create(
    input: NodeEntityMutationScope &
      Readonly<{ body: Readonly<Record<string, NodeJson | undefined>> }>,
  ): Promise<NodeBase>;
  update(
    input: NodeEntityMutationScope &
      Readonly<{ id: string; body: Readonly<Record<string, NodeJson | undefined>> }>,
  ): Promise<NodeBase>;
  delete(input: NodeEntityMutationScope & Readonly<{ id: string }>): Promise<NodeBase>;
}

interface NodeV2Route {
  readonly nodeType: string;
  readonly collection: string;
  readonly filters?: readonly string[];
  readonly auth: Readonly<Record<"create" | "update" | "delete", AuthPolicy>>;
}

export interface NodeEntityV2Binding extends NodeV2Route {
  readonly operations?: {
    readonly create?: Readonly<{ body?: TSchema }> | false;
    readonly update?: Readonly<{ body?: TSchema }> | false;
    readonly delete?: Readonly<Record<never, never>> | false;
  };
}

export const nodeV2AuthPolicies = {
  create: nodeCreatePolicy,
  update: nodeUpdatePolicy,
  delete: nodeDeletePolicy,
};

const JsonSchema = Type.Recursive((Self) =>
  Type.Union([
    Type.Null(),
    Type.Boolean(),
    Type.Number(),
    Type.String(),
    Type.Array(Self),
    Type.Record(Type.String(), Self),
  ]),
);
const JsonObjectSchema = Type.Record(Type.String(), JsonSchema);
const ProjectVersionSchema = t.Numeric({ minimum: 1, multipleOf: 1 });
const ProjectParamsSchema = Type.Object(
  { projectId: Type.String({ format: "uuid" }) },
  { additionalProperties: false },
);

function assertCollection(collection: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(collection)) {
    throw new TypeError(`Invalid node REST collection '${collection}'`);
  }
}

function filterSchemas(node: NodeDefinition, fields: readonly string[]) {
  return Object.fromEntries(
    fields.map((field, index) => {
      const schema = node.schemas.response.properties[field];
      if (schema === undefined || fields.indexOf(field) !== index || !isScalarSchema(schema)) {
        throw new TypeError(`Invalid node REST filter '${node.nodeType}.${field}'`);
      }
      return [field, Type.Optional(t.ArrayQuery(schema))];
    }),
  );
}

const scalarSchemaGuards: readonly ((schema: TSchema) => boolean)[] = [
  TypeGuard.IsString,
  TypeGuard.IsNumber,
  TypeGuard.IsInteger,
  TypeGuard.IsBoolean,
  TypeGuard.IsNull,
  TypeGuard.IsLiteral,
  TypeGuard.IsTemplateLiteral,
  TypeGuard.IsRegExp,
];

function isScalarSchema(schema: TSchema): boolean {
  return (
    scalarSchemaGuards.some((guard) => guard(schema)) ||
    (TypeGuard.IsUnion(schema) && schema.anyOf.every(isScalarSchema))
  );
}

function publicRow(node: NodeDefinition, row: NodeBase) {
  const { nodeType: _nodeType, ...value } = row;
  return Value.Parse(node.schemas.response, value);
}

function filterValues(node: NodeDefinition, request: Request, fields: readonly string[]) {
  const search = new URL(request.url).searchParams;
  return Object.fromEntries(
    fields.flatMap((field) => {
      const values = search.getAll(field);
      if (values.length === 0) return [];
      const schema = node.schemas.response.properties[field];
      if (schema === undefined) throw new TypeError(`Unknown node REST filter '${field}'`);
      return [
        [
          field,
          values.map((value) => {
            const parsed = Value.Parse(schema, Value.Convert(schema, value));
            const databaseValue = Value.Parse(NodeDatabaseValueSchema, parsed);
            return node.fieldRules?.[field]?.toDatabase?.(databaseValue) ?? databaseValue;
          }),
        ],
      ];
    }),
  );
}

async function requireNode<Schema extends NodeSchema>(
  runtime: NodeRuntime<Schema>,
  nodeType: string,
  projectId: string,
  projectVersion: number,
  id: string,
) {
  const result = await batchNodes(runtime, projectId, projectVersion, [{ nodeType, id }]);
  const row = result.results[0];
  if (row === undefined) {
    throw NodeNotFoundError({ internal: { nodeType, projectId, projectVersion, id } });
  }
  return row;
}

async function requireMutation<Schema extends NodeSchema>(
  runtime: NodeRuntime<Schema>,
  auth: RequestAuthorization,
  projectId: string,
  projectVersion: number,
  input: NodeMutationInput,
) {
  const result = await transactNodeMutation(runtime, auth, projectId, projectVersion, input);
  if (result.isErr()) throw result.error;
  return result.value;
}

function defaultNodeEntityService<Schema extends NodeSchema>(
  runtime: NodeRuntime<Schema>,
  node: NodeDefinition,
): NodeEntityService {
  const service = {
    paginate: ({ projectId, projectVersion, limit, offset, filters }) =>
      paginateNodes(runtime, node.nodeType, projectId, projectVersion, limit, offset, filters),
    findUnique: ({ projectId, projectVersion, id }) =>
      requireNode(runtime, node.nodeType, projectId, projectVersion, id),
    async create({ auth, projectId, projectVersion, body }) {
      const mutation = await requireMutation(runtime, auth, projectId, projectVersion, {
        inserts: [{ nodeType: node.nodeType, payload: body }],
      });
      const created = mutation.inserted[0];
      if (created === undefined) throw new Error("Node create returned no row");
      return created;
    },
    async update({ auth, projectId, projectVersion, id, body }) {
      const mutation = await requireMutation(runtime, auth, projectId, projectVersion, {
        updates: [{ nodeType: node.nodeType, id, payload: body }],
      });
      return (
        mutation.updated[0] ?? requireNode(runtime, node.nodeType, projectId, projectVersion, id)
      );
    },
    async delete({ auth, projectId, projectVersion, id }) {
      const mutation = await requireMutation(runtime, auth, projectId, projectVersion, {
        deletes: [{ nodeType: node.nodeType, id }],
      });
      const deleted = mutation.deleted[0];
      if (deleted === undefined) throw new Error("Node delete returned no row");
      return deleted;
    },
  } satisfies NodeEntityService;
  return Object.freeze(service);
}

export function createNodeEntityService<Schema extends NodeSchema>(
  runtime: NodeRuntime<Schema>,
  nodeType: string,
): NodeEntityService {
  return defaultNodeEntityService(runtime, nodeDefinition(runtime, nodeType));
}

const pascalIdentifier = (value: string) =>
  value
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("");

type NodeEntityServiceResolver<App extends AnyElysia> = (
  context: RuntimeContext<App>,
  node: NodeDefinition,
) => NodeEntityService | Promise<NodeEntityService>;

export function bindNodeEntityV2Routes<const App extends AnyElysia>(
  app: App,
  descriptor: NodeDescriptor,
  resolveService: NodeEntityServiceResolver<App>,
  binding: NodeEntityV2Binding,
  operationDomain: string,
) {
  assertCollection(binding.collection);
  const node = nodeDefinition(descriptor, binding.nodeType);
  const filters = binding.filters ?? [];
  const declaredFilters = filterSchemas(node, filters);
  const idSchema = node.schemas.response.properties.id;
  if (idSchema === undefined) throw new TypeError(`Node '${node.nodeType}' has no public id`);
  const itemParams = Type.Object(
    { projectId: ProjectParamsSchema.properties.projectId, id: idSchema },
    { additionalProperties: false },
  );
  const listQuery = Type.Object(
    {
      projectVersion: ProjectVersionSchema,
      ...RestPaginationQueryProperties,
      ...declaredFilters,
    },
    { additionalProperties: true },
  );
  const itemQuery = Type.Object(
    { projectVersion: ProjectVersionSchema },
    { additionalProperties: true },
  );
  const pageResponse = restPageResponseSchema(node.schemas.response);
  const operationPrefix = `v2${pascalIdentifier(operationDomain)}${pascalIdentifier(node.nodeType)}`;

  return app.group(`/projects/:projectId/${binding.collection}`, (group) => {
    group.get(
      "",
      async (context) => {
        const { params, query, request } = context;
        const pagination = parseRestPagination(request, query, filters, ["projectVersion"]);
        const service = await resolveService(context, node);
        const page = await service.paginate({
          projectId: params.projectId,
          projectVersion: query.projectVersion,
          limit: pagination.limit,
          offset: pagination.offset,
          filters: filterValues(node, request, filters),
        });
        return {
          data: page.items.map((row) => publicRow(node, row)),
          pagination: restPaginationMetadata(pagination, page.items.length, page.total),
        };
      },
      {
        params: ProjectParamsSchema,
        query: listQuery,
        response: { 200: pageResponse, 400: RestQueryErrorSchema },
        detail: { operationId: `${operationPrefix}List` },
      },
    );

    const createOperation = binding.operations?.create;
    if (createOperation !== false) {
      group.post(
        "",
        async (context) => {
          const { auth, body, params, query, request } = context;
          assertRestQuery(request, { single: ["projectVersion"] });
          const service = await resolveService(context, node);
          const payload = Value.Parse(JsonObjectSchema, body);
          const created = await service.create({
            auth,
            projectId: params.projectId,
            projectVersion: query.projectVersion,
            body: payload,
          });
          return status(201, publicRow(node, created));
        },
        {
          params: ProjectParamsSchema,
          query: itemQuery,
          body: createOperation?.body ?? node.schemas.insert,
          response: { 201: node.schemas.response, 400: RestQueryErrorSchema },
          auth: binding.auth.create,
          detail: { operationId: `${operationPrefix}Create` },
        },
      );
    }

    group.get(
      "/:id",
      async (context) => {
        const { params, query, request } = context;
        assertRestQuery(request, { single: ["projectVersion"] });
        const service = await resolveService(context, node);
        return publicRow(
          node,
          await service.findUnique({
            projectId: params.projectId,
            projectVersion: query.projectVersion,
            id: params.id,
          }),
        );
      },
      {
        params: itemParams,
        query: itemQuery,
        response: { 200: node.schemas.response, 400: RestQueryErrorSchema },
        detail: { operationId: `${operationPrefix}Get` },
      },
    );

    const updateOperation = binding.operations?.update;
    if (updateOperation !== false) {
      group.patch(
        "/:id",
        async (context) => {
          const { auth, body, params, query, request } = context;
          assertRestQuery(request, { single: ["projectVersion"] });
          const service = await resolveService(context, node);
          const payload = Value.Parse(JsonObjectSchema, body);
          const updated = await service.update({
            auth,
            projectId: params.projectId,
            projectVersion: query.projectVersion,
            id: params.id,
            body: payload,
          });
          return publicRow(node, updated);
        },
        {
          params: itemParams,
          query: itemQuery,
          body: updateOperation?.body ?? node.schemas.patch,
          response: { 200: node.schemas.response, 400: RestQueryErrorSchema },
          auth: binding.auth.update,
          detail: { operationId: `${operationPrefix}Update` },
        },
      );
    }

    const deleteOperation = binding.operations?.delete;
    if (deleteOperation !== false) {
      group.delete(
        "/:id",
        async (context) => {
          const { auth, params, query, request } = context;
          assertRestQuery(request, { single: ["projectVersion"] });
          const service = await resolveService(context, node);
          const deleted = await service.delete({
            auth,
            projectId: params.projectId,
            projectVersion: query.projectVersion,
            id: params.id,
          });
          return publicRow(node, deleted);
        },
        {
          params: itemParams,
          query: itemQuery,
          response: { 200: node.schemas.response, 400: RestQueryErrorSchema },
          auth: binding.auth.delete,
          detail: { operationId: `${operationPrefix}Delete` },
        },
      );
    }

    return group;
  });
}
