const resourceService: unique symbol = Symbol("@spark-workflow/resource/service");

export interface Resource<out Id extends string, out Service> {
  readonly id: Id;
  readonly [resourceService]: Service;
}

export type AnyResource = Resource<string, unknown>;

export type ResourceNeeds = Readonly<Record<string, AnyResource>>;

export type ResourceId<Value extends AnyResource> =
  Value extends Resource<infer Id, unknown> ? Id : never;

export type ResourceValue<Value extends AnyResource> =
  Value extends Resource<string, infer Service> ? Service : never;

export type ResolvedResourceNeeds<Needs extends ResourceNeeds> = Readonly<{
  [Key in keyof Needs]: ResourceValue<Needs[Key]>;
}>;

export const defineResource =
  <Service>() =>
  <const Id extends string>(id: Id): Resource<Id, Service> =>
    Object.freeze({ id }) as Resource<Id, Service>;

export interface ResourceProvider<Provided extends AnyResource, Needs extends ResourceNeeds> {
  readonly resource: Provided;
  readonly needs: Needs;
  make(
    resources: ResolvedResourceNeeds<Needs>,
  ): ResourceValue<Provided> | Promise<ResourceValue<Provided>>;
  release?(value: ResourceValue<Provided>): void | Promise<void>;
}

export type AnyResourceProvider = ResourceProvider<AnyResource, ResourceNeeds>;

export function provide<const Provided extends AnyResource, const Needs extends ResourceNeeds>(
  provider: ResourceProvider<Provided, Needs>,
): ResourceProvider<Provided, Needs> {
  return Object.freeze({
    ...provider,
    needs: Object.freeze({ ...provider.needs }),
  });
}

export const provideValue = <const Provided extends AnyResource>(
  resource: Provided,
  value: ResourceValue<Provided>,
) => provide({ resource, needs: {}, make: () => value });
