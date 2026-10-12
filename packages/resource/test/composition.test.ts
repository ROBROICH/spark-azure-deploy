import { describe, expect, test } from "bun:test";

import {
  DuplicateFeatureTableError,
  InvalidFeatureGraphError,
  combineTables,
  composeFeatures,
  defineFeature,
  defineResource,
  provide,
} from "../src";
import type { FeatureManifest } from "../src";

interface ProjectService {
  find(id: string): Promise<string>;
}

interface DocumentService {
  list(projectId: string): Promise<readonly string[]>;
}

const Projects = defineResource<ProjectService>()("test/Projects");
const Documents = defineResource<DocumentService>()("test/Documents");

const projects = provide({
  resource: Projects,
  needs: {},
  make: () => ({ find: async (id) => id }),
});

const documents = provide({
  resource: Documents,
  needs: { projects: Projects },
  make: ({ projects }) => ({
    async list(projectId) {
      return [await projects.find(projectId)];
    },
  }),
});

const core = defineFeature({
  id: "core",
  needs: {},
  providers: [projects] as const,
  tables: {},
});

const documentFeature = defineFeature({
  id: "documents",
  needs: { projects: Projects },
  providers: [documents] as const,
  tables: {},
});

// @ts-expect-error Feature manifests can only be created by composeFeatures.
const rawFeatureManifest: FeatureManifest<readonly [typeof core]> = {
  features: [core] as const,
};
void rawFeatureManifest;

describe("feature composition", () => {
  test("accepts a closed provider graph", () => {
    const manifest = composeFeatures([core, documentFeature] as const);
    expect(manifest.features.map(({ id }) => id)).toEqual(["core", "documents"]);
  });

  test("snapshots and freezes the composed feature list", () => {
    const features: [typeof core, typeof documentFeature] = [core, documentFeature];
    const manifest = composeFeatures(features);

    features.pop();

    expect(Object.isFrozen(manifest.features)).toBe(true);
    expect(manifest.features.map(({ id }) => id)).toEqual(["core", "documents"]);
  });

  test("freezes feature graph edges before composition", () => {
    expect(() => Object.assign(documents.needs, { cycle: Documents })).toThrow();
    expect(() => Object.assign(documentFeature.needs, { documents: Documents })).toThrow();
    expect(Object.isFrozen(documentFeature.providers)).toBe(true);

    const manifest = composeFeatures([core, documentFeature] as const);
    expect(manifest.features.map(({ id }) => id)).toEqual(["core", "documents"]);
  });

  test("combines distinct tables and rejects every repeated key", () => {
    const shared = {};
    const first = defineFeature({
      id: "first",
      needs: {},
      providers: [] as const,
      tables: { first: {}, shared },
    });
    const second = defineFeature({
      id: "second",
      needs: {},
      providers: [] as const,
      tables: { second: {}, shared },
    });
    expect(() => combineTables([first, second] as const)).toThrow(DuplicateFeatureTableError);

    const distinct = defineFeature({
      id: "distinct",
      needs: {},
      providers: [] as const,
      tables: { second: {} },
    });
    expect(Object.keys(combineTables([first, distinct] as const))).toEqual([
      "first",
      "shared",
      "second",
    ]);
  });

  test("rejects a missing provider at runtime", () => {
    expect(() =>
      composeFeatures(
        // @ts-expect-error Documents needs Projects and the graph omits its provider.
        [documentFeature] as const,
      ),
    ).toThrow(InvalidFeatureGraphError);
  });

  test("rejects a duplicate provider at runtime", () => {
    const duplicate = defineFeature({
      id: "duplicate",
      needs: {},
      providers: [projects] as const,
      tables: {},
    });

    expect(() =>
      composeFeatures(
        // @ts-expect-error Projects has two providers.
        [core, duplicate] as const,
      ),
    ).toThrow(InvalidFeatureGraphError);
  });

  test("rejects a distinct Resource token that reuses a provider id", () => {
    const ProjectsAlias = defineResource<ProjectService>()("test/Projects");
    const aliasedNeed = defineFeature({
      id: "aliased-need",
      needs: { projects: ProjectsAlias },
      providers: [] as const,
      tables: {},
    });

    expect(() => composeFeatures([core, aliasedNeed] as const)).toThrow(InvalidFeatureGraphError);
  });

  test("rejects an incompatible service behind the same Resource id", () => {
    const IncompatibleProjects = defineResource<{ count(): number }>()("test/Projects");
    const incompatibleNeed = defineFeature({
      id: "incompatible-need",
      needs: { projects: IncompatibleProjects },
      providers: [] as const,
      tables: {},
    });

    expect(() =>
      composeFeatures(
        // @ts-expect-error The provider behind test/Projects has an incompatible service.
        [core, incompatibleNeed] as const,
      ),
    ).toThrow(InvalidFeatureGraphError);
  });

  test("rejects distinct provider tokens that reuse an id", () => {
    const ProjectsAlias = defineResource<ProjectService>()("test/Projects");
    const duplicate = defineFeature({
      id: "duplicate-token",
      needs: {},
      providers: [
        provide({
          resource: ProjectsAlias,
          needs: {},
          make: () => ({ find: async (id) => id }),
        }),
      ] as const,
      tables: {},
    });

    expect(() =>
      composeFeatures(
        // @ts-expect-error test/Projects has two providers.
        [core, duplicate] as const,
      ),
    ).toThrow(InvalidFeatureGraphError);
  });

  test("rejects provider cycles at composition", () => {
    const First = defineResource<{ first: true }>()("test/First");
    const Second = defineResource<{ second: true }>()("test/Second");
    const first = provide({
      resource: First,
      needs: { second: Second },
      make: () => ({ first: true as const }),
    });
    const second = provide({
      resource: Second,
      needs: { first: First },
      make: () => ({ second: true as const }),
    });

    expect(() =>
      composeFeatures([
        defineFeature({
          id: "cycle",
          needs: {},
          providers: [first, second] as const,
          tables: {},
        }),
      ] as const),
    ).toThrow(InvalidFeatureGraphError);
  });
});
