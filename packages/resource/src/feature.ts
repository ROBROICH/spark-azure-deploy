import {
  provide,
  type AnyResource,
  type AnyResourceProvider,
  type ResourceId,
  type ResourceNeeds,
  type ResourceProvider,
} from "./resource";

const featureDefinition: unique symbol = Symbol("@spark-workflow/resource/feature-definition");

export interface Feature<
  out Id extends string,
  out Needs extends ResourceNeeds,
  out Providers extends readonly AnyResourceProvider[],
  out Tables extends object,
> {
  readonly id: Id;
  readonly needs: Needs;
  readonly providers: Providers;
  readonly tables: Tables;
  readonly [featureDefinition]: true;
}

export type AnyFeature = Feature<string, ResourceNeeds, readonly AnyResourceProvider[], object>;

export function defineFeature<
  const Id extends string,
  const Needs extends ResourceNeeds,
  const Providers extends readonly ResourceProvider<AnyResource, ResourceNeeds>[],
  const Tables extends object,
>(
  feature: Omit<Feature<Id, Needs, Providers, Tables>, typeof featureDefinition>,
): Feature<Id, Needs, Providers, Tables> {
  return Object.freeze({
    ...feature,
    needs: Object.freeze({ ...feature.needs }),
    providers: Object.freeze(feature.providers.map((provider) => provide(provider))) as Providers,
    tables: Object.freeze({ ...feature.tables }),
    [featureDefinition]: true,
  } satisfies Feature<Id, Needs, Providers, Tables>);
}

type ProviderIds<Providers extends readonly unknown[]> = Providers extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends AnyResourceProvider
    ? [ResourceId<Head["resource"]>, ...ProviderIds<Tail>]
    : ProviderIds<Tail>
  : [];

type ProviderNeeds<Providers extends readonly unknown[]> = Providers[number] extends infer Provider
  ? Provider extends AnyResourceProvider
    ? Provider["needs"][keyof Provider["needs"]]
    : never
  : never;

type AllProviderIds<
  Features extends readonly unknown[],
  Accumulator extends readonly string[] = [],
> = Features extends readonly [infer Head, ...infer Tail]
  ? Head extends AnyFeature
    ? AllProviderIds<Tail, [...Accumulator, ...ProviderIds<Head["providers"]>]>
    : AllProviderIds<Tail, Accumulator>
  : Accumulator;

type AllProvidedResources<Features extends readonly AnyFeature[]> =
  Features[number]["providers"][number]["resource"];

type AllNeededResources<Features extends readonly unknown[]> = Features[number] extends infer Value
  ? Value extends AnyFeature
    ? Value["needs"][keyof Value["needs"]] | ProviderNeeds<Value["providers"]>
    : never
  : never;

type UnsatisfiedResources<
  Features extends readonly AnyFeature[],
  Need extends AnyResource = AllNeededResources<Features>,
> = Need extends AnyResource
  ? Extract<AllProvidedResources<Features>, Need> extends never
    ? Need
    : never
  : never;

type DuplicateIds<
  Ids extends readonly string[],
  Seen extends string = never,
  Duplicates extends string = never,
> = Ids extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
  ? DuplicateIds<Tail, Seen | Head, Duplicates | (Head extends Seen ? Head : never)>
  : Duplicates;

type FeatureIds<Features extends readonly unknown[]> = Features extends readonly [
  infer Head,
  ...infer Tail,
]
  ? Head extends AnyFeature
    ? [Head["id"], ...FeatureIds<Tail>]
    : FeatureIds<Tail>
  : [];

type MissingProviderIds<Features extends readonly AnyFeature[]> = ResourceId<
  UnsatisfiedResources<Features>
>;

type DuplicateProviderIds<Features extends readonly AnyFeature[]> = DuplicateIds<
  AllProviderIds<Features>
>;

type DuplicateFeatureIds<Features extends readonly AnyFeature[]> = DuplicateIds<
  FeatureIds<Features>
>;

export type FeatureGraphError<Features extends readonly AnyFeature[]> =
  | (MissingProviderIds<Features> extends never
      ? never
      : Readonly<{
          kind: "missing-resource-providers";
          resources: MissingProviderIds<Features>;
        }>)
  | (DuplicateProviderIds<Features> extends never
      ? never
      : Readonly<{
          kind: "duplicate-resource-providers";
          resources: DuplicateProviderIds<Features>;
        }>)
  | (DuplicateFeatureIds<Features> extends never
      ? never
      : Readonly<{
          kind: "duplicate-feature-ids";
          features: DuplicateFeatureIds<Features>;
        }>);

type ValidFeatureGraph<Features extends readonly AnyFeature[]> =
  FeatureGraphError<Features> extends never
    ? Features
    : Features & Readonly<{ featureGraphError: FeatureGraphError<Features> }>;

const featureManifest: unique symbol = Symbol("@spark-workflow/resource/feature-manifest");

export interface FeatureManifest<out Features extends readonly AnyFeature[]> {
  readonly features: Features;
  readonly [featureManifest]: true;
}

type UnionToIntersection<Value> = (Value extends unknown ? (value: Value) => void : never) extends (
  value: infer Intersection,
) => void
  ? Intersection
  : never;

export class InvalidFeatureGraphError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid feature graph: ${problems.join("; ")}`);
    this.name = "InvalidFeatureGraphError";
  }
}

export class DuplicateFeatureTableError extends Error {
  constructor(
    readonly table: string,
    readonly owners: readonly [string, string] | undefined = undefined,
  ) {
    super(
      owners === undefined
        ? `Feature table key '${table}' has multiple definitions`
        : `Feature table key '${table}' has multiple definitions in '${owners[0]}' and '${owners[1]}'`,
    );
    this.name = "DuplicateFeatureTableError";
  }
}

type TableSet = Readonly<{ id: string; tables: object }>;

export function combineTables<const Sets extends readonly TableSet[]>(
  sets: Sets,
): UnionToIntersection<Sets[number]["tables"]> {
  const definitions = new Map<string, Readonly<{ owner: string; value: unknown }>>();
  for (const set of sets) {
    for (const [key, value] of Object.entries(set.tables)) {
      const existing = definitions.get(key);
      if (existing !== undefined) {
        throw new DuplicateFeatureTableError(key, [existing.owner, set.id]);
      }
      definitions.set(key, { owner: set.id, value });
    }
  }
  return Object.freeze(
    Object.fromEntries([...definitions].map(([key, definition]) => [key, definition.value])),
  ) as UnionToIntersection<Sets[number]["tables"]>;
}

function assertValidFeatureGraph(features: readonly AnyFeature[]): void {
  const featureIds = new Set<string>();
  const providers = new Map<AnyResource, AnyResourceProvider>();
  const providerIds = new Set<string>();
  const needs = new Set<AnyResource>();
  const problems: string[] = [];

  for (const feature of features) {
    if (featureIds.has(feature.id)) problems.push(`duplicate feature '${feature.id}'`);
    featureIds.add(feature.id);
    for (const resource of Object.values(feature.needs)) needs.add(resource);
    for (const provider of feature.providers) {
      if (providerIds.has(provider.resource.id)) {
        problems.push(`duplicate provider '${provider.resource.id}'`);
      }
      providerIds.add(provider.resource.id);
      providers.set(provider.resource, provider);
      for (const resource of Object.values(provider.needs)) needs.add(resource);
    }
  }

  for (const need of needs) {
    if (!providers.has(need)) {
      problems.push(
        providerIds.has(need.id)
          ? `provider token does not match Resource '${need.id}'`
          : `missing provider '${need.id}'`,
      );
    }
  }
  if (problems.length === 0) {
    const unresolved = new Set(providers.keys());
    while (unresolved.size > 0) {
      const ready = [...unresolved].filter((resource) => {
        const provider = providers.get(resource);
        return (
          provider !== undefined &&
          Object.values(provider.needs).every((need) => !unresolved.has(need))
        );
      });
      if (ready.length === 0) {
        problems.push(
          `provider dependency cycle among '${[...unresolved]
            .map((resource) => resource.id)
            .join("', '")}'`,
        );
        break;
      }
      for (const resource of ready) unresolved.delete(resource);
    }
  }
  if (problems.length > 0) throw new InvalidFeatureGraphError(problems);
}

export function composeFeatures<const Features extends readonly AnyFeature[]>(
  features: ValidFeatureGraph<Features>,
): FeatureManifest<Features> {
  assertValidFeatureGraph(features);
  const snapshot = Object.freeze([...features]) as Features;
  return Object.freeze({
    features: snapshot,
    [featureManifest]: true,
  } satisfies FeatureManifest<Features>);
}

export type ProvidedResources<Manifest extends FeatureManifest<readonly AnyFeature[]>> =
  Manifest["features"][number]["providers"][number]["resource"];
