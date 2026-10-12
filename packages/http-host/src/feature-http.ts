import { authentication } from "@spark-workflow/authentification";
import { PostgreSQL, type PostgresSchema, type PostgresScope } from "@spark-workflow/postgres-runtime";
import type {
  AnyResource,
  Resource,
  ResourceNeeds,
  ResourceRuntime,
  ResourceValue,
} from "@spark-workflow/resource";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { Result } from "better-result";
import { Elysia, t } from "elysia";
import type { EvlogError } from "evlog";

import { resultResponses } from "./result-response.ts";

export interface ProjectVersionSource {
  resolveLatestVersion(projectId: string): Promise<Result<number, EvlogError>>;
}

const ProjectIdParams = Type.Object({ projectId: Type.String() });

export const RequestedProjectVersionQuery = Type.Object(
  { projectVersion: Type.Optional(t.Numeric({ minimum: 1 })) },
  { additionalProperties: false },
);

type ProjectVersionContext = Readonly<{
  projects: ProjectVersionSource;
  params: Readonly<Record<string, string>>;
  query: Static<typeof RequestedProjectVersionQuery>;
}>;

async function latestProjectVersion({ projects, params }: ProjectVersionContext) {
  const { projectId } = Value.Parse(ProjectIdParams, params);
  const version = await projects.resolveLatestVersion(projectId);
  if (version.isErr()) throw version.error;
  return version.value;
}

const projectVersionMacros = {
  projectVersion: {
    projects: true,
    query: RequestedProjectVersionQuery,
    resolve: async (context: ProjectVersionContext) => ({
      projectVersion: context.query.projectVersion ?? (await latestProjectVersion(context)),
    }),
  },
  latestProjectVersion: {
    projects: true,
    resolve: async (context: ProjectVersionContext) => ({
      projectVersion: await latestProjectVersion(context),
    }),
  },
};

type ProjectVersionMacros<Needs extends ResourceNeeds> =
  Needs extends Readonly<{ projects: Resource<string, ProjectVersionSource> }>
    ? typeof projectVersionMacros
    : {};

type ResourceMacros<Needs extends ResourceNeeds> = {
  readonly [Key in keyof Needs & string]: Readonly<{
    resolve(): Promise<{ [Resolved in Key]: ResourceValue<Needs[Resolved]> }>;
  }>;
} & ProjectVersionMacros<Needs>;

function createResourceMacros<const Needs extends ResourceNeeds>(
  name: string,
  runtime: ResourceRuntime<Needs[keyof Needs]>,
  needs: Needs,
) {
  const entries = Object.entries(needs) as Array<[keyof Needs & string, Needs[keyof Needs]]>;
  const macros = Object.fromEntries([
    ...entries.map(([key, resource]) => [
      key,
      {
        async resolve() {
          return { [key]: await runtime.get(resource) };
        },
      },
    ]),
    ...(Object.hasOwn(needs, "projects") ? Object.entries(projectVersionMacros) : []),
  ]) as ResourceMacros<Needs>;

  return new Elysia({ name: `${name}.resources` }).macro(macros);
}
type HttpFeature = Readonly<{
  needs: ResourceNeeds;
  tables: PostgresSchema;
}>;

type NeededResources<Definition extends HttpFeature> =
  Definition["needs"][keyof Definition["needs"]];

type FeatureResources<Definition extends HttpFeature> =
  | typeof PostgreSQL
  | NeededResources<Definition>;

function bindFeatureHttp<Definition extends HttpFeature>(
  feature: Definition,
  runtime: ResourceRuntime<FeatureResources<Definition>>,
) {
  let postgres: Promise<PostgresScope<Definition["tables"]>> | undefined;
  const resolvePostgres = () =>
    (postgres ??= runtime.get(PostgreSQL).then((service) => service.scope(feature.tables)));
  const featureResources = runtime as ResourceRuntime<NeededResources<Definition>>;

  return Object.freeze({
    needs: feature.needs,
    controller: (name: string) =>
      new Elysia({ name, normalize: false })
        .use(resultResponses)
        .use(authentication)
        .resolve({ as: "scoped" }, async () => ({ postgres: await resolvePostgres() }))
        .use(createResourceMacros<Definition["needs"]>(name, featureResources, feature.needs)),
  });
}

export type FeatureHttp<Definition extends HttpFeature> = Omit<
  ReturnType<typeof bindFeatureHttp<Definition>>,
  "needs"
> &
  Readonly<{ needs: Definition["needs"] }>;

export function createFeatureHttp<Available extends AnyResource>(
  runtime: ResourceRuntime<Available>,
) {
  return Object.freeze({
    for<const Definition extends HttpFeature>(
      feature: Definition & (FeatureResources<Definition> extends Available ? unknown : never),
    ): FeatureHttp<Definition> {
      const featureResources = runtime as ResourceRuntime<FeatureResources<Definition>>;
      return bindFeatureHttp(feature, featureResources);
    },
  });
}
