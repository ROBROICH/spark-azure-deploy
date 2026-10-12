import {
  defineResource,
  provide,
  type Resource,
  type ResourceNeeds,
  type ResourceProvider,
  type ResolvedResourceNeeds,
} from "@spark-workflow/resource";
import type { AnyElysia } from "elysia";

import type { NodeDescriptor, NodeRuntime, NodeSchema } from "./descriptor";
import { nodeDefinition } from "./descriptor";
import {
  bindNodeEntityV2Routes,
  createNodeEntityService,
  type NodeEntityService,
  type NodeEntityV2Binding,
} from "./v2-routes";

export interface NodeEntityDefinition<
  Schema extends NodeSchema = NodeSchema,
  Needs extends ResourceNeeds = ResourceNeeds,
> extends NodeEntityV2Binding {
  readonly mutations?: (
    capability: NodeEntityCapability<Schema, Needs>,
    standard: NodeEntityService,
  ) => Partial<NodeEntityMutations>;
}

type NodeEntityMutations = Pick<NodeEntityService, "create" | "update" | "delete">;

export type NodeEntityCapability<
  Schema extends NodeSchema,
  Needs extends ResourceNeeds,
> = Readonly<{
  node: NodeRuntime<Schema>;
}> &
  ResolvedResourceNeeds<Needs>;

type EntityKey<Entity extends Readonly<{ nodeType: string }>> = `v2:${Entity["nodeType"]}`;

type AnyNodeEntityDefinition<
  Schema extends NodeSchema = NodeSchema,
  Needs extends ResourceNeeds = ResourceNeeds,
> = NodeEntityDefinition<Schema, Needs>;
type NodeEntityDefinitions<Schema extends NodeSchema, Needs extends ResourceNeeds> = readonly [
  AnyNodeEntityDefinition<Schema, Needs>,
  ...AnyNodeEntityDefinition<Schema, Needs>[],
];

type CapabilityResource<
  Id extends string,
  Schema extends NodeSchema,
  Needs extends ResourceNeeds,
> = Resource<`${Id}/NodeCapability`, NodeEntityCapability<Schema, Needs>>;

type EntityResource<Id extends string, Entity extends Readonly<{ nodeType: string }>> = Resource<
  `${Id}/${Entity["nodeType"]}`,
  NodeEntityService
>;

type EntityNeeds<
  Id extends string,
  Schema extends NodeSchema,
  Needs extends ResourceNeeds,
  Entities extends NodeEntityDefinitions<Schema, Needs>,
> = Readonly<{
  [Entity in Entities[number] as EntityKey<Entity>]: EntityResource<Id, Entity>;
}>;

type EntityProvider<
  Id extends string,
  Schema extends NodeSchema,
  Needs extends ResourceNeeds,
  Entity extends AnyNodeEntityDefinition<Schema, Needs>,
> = ResourceProvider<
  EntityResource<Id, Entity>,
  Readonly<{ capability: CapabilityResource<Id, Schema, Needs> }>
>;

type EntityProviders<
  Id extends string,
  Schema extends NodeSchema,
  Needs extends ResourceNeeds,
  Entities extends NodeEntityDefinitions<Schema, Needs>,
> = Readonly<{
  [Index in keyof Entities]: Entities[Index] extends AnyNodeEntityDefinition<Schema, Needs>
    ? EntityProvider<Id, Schema, Needs, Entities[Index]>
    : never;
}>;

type EntityRoutes<
  Id extends string,
  Schema extends NodeSchema,
  Needs extends ResourceNeeds,
  Entities extends NodeEntityDefinitions<Schema, Needs>,
> = Readonly<{
  [Index in keyof Entities]: Entities[Index] extends AnyNodeEntityDefinition<Schema, Needs>
    ? Readonly<
        Omit<Entities[Index], "mutations"> & {
          key: EntityKey<Entities[Index]>;
          resource: EntityResource<Id, Entities[Index]>;
        }
      >
    : never;
}>;

export interface NodeEntitySet<
  Id extends string,
  Schema extends NodeSchema,
  Needs extends ResourceNeeds,
  Entities extends NodeEntityDefinitions<Schema, Needs>,
> {
  readonly controller: string;
  readonly descriptor: NodeDescriptor;
  readonly id: Id;
  readonly needs: EntityNeeds<Id, Schema, Needs, Entities>;
  readonly providers: readonly [
    ResourceProvider<
      CapabilityResource<Id, Schema, Needs>,
      Needs & Readonly<{ node: Resource<string, NodeRuntime<Schema>> }>
    >,
    ...EntityProviders<Id, Schema, Needs, Entities>,
  ];
  readonly routes: EntityRoutes<Id, Schema, Needs, Entities>;
}

export function defineNodeEntities<
  const Id extends string,
  Schema extends NodeSchema,
  const Needs extends ResourceNeeds,
  const Entities extends NodeEntityDefinitions<Schema, Needs>,
>(input: {
  readonly id: Id;
  readonly controller: string;
  readonly descriptor: NodeDescriptor;
  readonly nodes: Resource<string, NodeRuntime<Schema>>;
  readonly needs: "node" extends keyof Needs ? never : Needs;
  readonly entities: Entities;
}): NodeEntitySet<Id, Schema, Needs, Entities> {
  const nodeTypes = new Set<string>();
  for (const entity of input.entities) {
    nodeDefinition(input.descriptor, entity.nodeType);
    if (nodeTypes.has(entity.nodeType)) {
      throw new TypeError(`Duplicate node entity type '${entity.nodeType}'`);
    }
    nodeTypes.add(entity.nodeType);
  }

  const capability = defineResource<NodeEntityCapability<Schema, Needs>>()(
    `${input.id}/NodeCapability`,
  );
  if (nodeTypes.has("NodeCapability")) {
    throw new TypeError(`Node entity Resource '${capability.id}' is reserved for its capability`);
  }
  const capabilityProvider = provide({
    resource: capability,
    needs: { ...input.needs, node: input.nodes },
    make: (resources) => Object.freeze(resources),
  });
  const entries = input.entities.map((entity) => {
    const resource = defineResource<NodeEntityService>()(`${input.id}/${entity.nodeType}`);
    const { mutations, ...route } = entity;
    return {
      mutations,
      route: Object.freeze({ ...route, key: `v2:${entity.nodeType}`, resource }),
    };
  });
  const routes = entries.map(({ route }) => route) as EntityRoutes<Id, Schema, Needs, Entities>;
  const entityProviders = entries.map(({ mutations, route: { resource, nodeType } }) =>
    provide({
      resource,
      needs: { capability },
      make: ({ capability: resolved }) => {
        const standard = createNodeEntityService(resolved.node, nodeType);
        return Object.freeze({ ...standard, ...mutations?.(resolved, standard) });
      },
    }),
  ) as EntityProviders<Id, Schema, Needs, Entities>;
  const providers: NodeEntitySet<Id, Schema, Needs, Entities>["providers"] = Object.freeze([
    capabilityProvider,
    ...entityProviders,
  ]);
  const needs = Object.freeze(
    Object.fromEntries(routes.map(({ key, resource }) => [key, resource])),
  ) as EntityNeeds<Id, Schema, Needs, Entities>;

  return Object.freeze({
    controller: input.controller,
    descriptor: input.descriptor,
    id: input.id,
    needs,
    providers,
    routes: Object.freeze(routes),
  });
}

interface BindableNodeEntitySet {
  readonly controller: string;
  readonly descriptor: NodeDescriptor;
  readonly id: string;
  readonly routes: readonly (NodeEntityV2Binding &
    Readonly<{
      key: string;
      resource: Resource<string, NodeEntityService>;
    }>)[];
}

type EntityRouteNeeds<Definition extends BindableNodeEntitySet> = Readonly<{
  [Route in Definition["routes"][number] as Route["key"]]: Route["resource"];
}>;

interface NodeEntityFeatureHttp<Needs extends ResourceNeeds> {
  readonly needs: Needs;
  controller(name: string): unknown;
}

type NodeEntityContext = Readonly<Record<string, NodeEntityService>>;

const contextEntityService = (context: NodeEntityContext, key: string): NodeEntityService =>
  context[key]!;

export function createNodeEntityResourceRoutes<const Definition extends BindableNodeEntitySet>(
  http: NodeEntityFeatureHttp<EntityRouteNeeds<NoInfer<Definition>>>,
  definition: Definition,
) {
  const app = http.controller(definition.controller) as AnyElysia;
  for (const route of definition.routes) {
    app.guard(
      { [route.key]: true },
      (guarded) =>
        bindNodeEntityV2Routes(
          guarded,
          definition.descriptor,
          (context) => contextEntityService(context, route.key),
          route,
          definition.id,
        ),
    );
  }
  return app;
}
