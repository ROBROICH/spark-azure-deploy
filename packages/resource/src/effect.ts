import { Context, Effect, Layer, ManagedRuntime } from "effect";

import type { AnyFeature, FeatureManifest, ProvidedResources } from "./feature";
import type {
  AnyResource,
  AnyResourceProvider,
  ResolvedResourceNeeds,
  ResourceNeeds,
  ResourceValue,
} from "./resource";
import type { ResourceRuntime } from "./runtime";

const resourceTags = new WeakMap<AnyResource, object>();
let nextResourceTag = 0;

const resourceTag = <Value extends AnyResource>(resource: Value) => {
  const existing = resourceTags.get(resource);
  if (existing !== undefined) {
    return existing as Context.Service<Value, ResourceValue<Value>>;
  }
  const tag = Context.Service<Value, ResourceValue<Value>>(
    `@spark-workflow/resource/${nextResourceTag++}/${resource.id}`,
  );
  resourceTags.set(resource, tag);
  return tag;
};

export class ResourceAcquisitionError extends Error {
  constructor(
    readonly resource: string,
    options: ErrorOptions,
  ) {
    super(`Failed to acquire Resource '${resource}'`, options);
    this.name = "ResourceAcquisitionError";
  }
}

type DynamicLayer = Layer.Layer<never, ResourceAcquisitionError, AnyResource>;

function resolve<Needs extends ResourceNeeds>(needs: Needs) {
  const effects: Record<string, Effect.Effect<unknown, never, AnyResource>> = {};
  for (const [key, resource] of Object.entries(needs)) {
    effects[key] = Effect.service(resourceTag(resource));
  }
  return Effect.all(effects) as Effect.Effect<
    ResolvedResourceNeeds<Needs>,
    never,
    Needs[keyof Needs]
  >;
}

function providerLayer(provider: AnyResourceProvider): DynamicLayer {
  const acquire = Effect.flatMap(resolve(provider.needs), (resources) =>
    Effect.tryPromise({
      try: () => Promise.resolve(provider.make(resources)),
      catch: (cause) => new ResourceAcquisitionError(provider.resource.id, { cause }),
    }),
  );
  const release = provider.release;
  const scoped =
    release === undefined
      ? acquire
      : Effect.acquireRelease(acquire, (service) =>
          Effect.tryPromise({
            try: () => Promise.resolve(release(service)),
            catch: (cause) => cause,
          }).pipe(Effect.orDie),
        );
  return Layer.effect(resourceTag(provider.resource), scoped);
}

function merge(layers: readonly DynamicLayer[]): DynamicLayer {
  return layers.reduce<DynamicLayer>((merged, layer) => Layer.merge(merged, layer), Layer.empty);
}

function manifestLayer<Manifest extends FeatureManifest<readonly AnyFeature[]>>(
  manifest: Manifest,
) {
  type Available = ProvidedResources<Manifest>;
  const providers = manifest.features.flatMap((feature) => [...feature.providers]);
  const byResource = new Map(providers.map((provider) => [provider.resource, provider]));
  const cache = new Map<AnyResource, DynamicLayer>();

  const visit = (provider: AnyResourceProvider): DynamicLayer => {
    const cached = cache.get(provider.resource);
    if (cached !== undefined) return cached;
    const dependencies = Object.values(provider.needs).map((resource) =>
      visit(byResource.get(resource)!),
    );
    const own = providerLayer(provider);
    const layer =
      dependencies.length === 0 ? own : own.pipe(Layer.provideMerge(merge(dependencies)));
    cache.set(provider.resource, layer);
    return layer;
  };

  return merge(providers.map(visit)) as Layer.Layer<Available, ResourceAcquisitionError, never>;
}

export function makeEffectResourceRuntime<
  const Manifest extends FeatureManifest<readonly AnyFeature[]>,
>(manifest: Manifest): ResourceRuntime<ProvidedResources<Manifest>> {
  type Available = ProvidedResources<Manifest>;
  const managed = ManagedRuntime.make(manifestLayer(manifest));

  return {
    async get<Value extends Available>(resource: Value): Promise<ResourceValue<Value>> {
      return Context.get(await managed.context(), resourceTag(resource));
    },
    async ready(): Promise<void> {
      await managed.context();
    },
    close: managed.dispose,
  };
}
