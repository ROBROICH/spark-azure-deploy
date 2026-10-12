import { describe, expect, test } from "bun:test";
import { PostgreSQL } from "@spark-workflow/postgres-runtime";
import { defineFeature, defineResource, type ResourceRuntime } from "@spark-workflow/resource";

import { createFeatureHttp } from "../src/index.ts";

process.env.AUTH_MODE = "disabled";

const Projects = defineResource<{ find(id: string): Promise<string> }>()("wiring-test/Projects");
const Documents = defineResource<{ read(id: string): Promise<Uint8Array> }>()(
  "wiring-test/Documents",
);
const projectsFeature = defineFeature({
  id: "wiring-test-projects",
  needs: { projects: Projects },
  providers: [],
  tables: {},
});
const documentsFeature = defineFeature({
  id: "wiring-test-documents",
  needs: { documents: Documents },
  providers: [],
  tables: {},
});
const resources: ResourceRuntime<typeof Projects | typeof PostgreSQL> = {
  get: async () => {
    throw new Error("Wiring tests never resolve a resource");
  },
  ready: async () => undefined,
  close: async () => undefined,
};

describe("feature HTTP wiring types", () => {
  test("binds a feature whose needs the runtime provides", () => {
    expect(createFeatureHttp(resources).for(projectsFeature).needs).toBe(projectsFeature.needs);
  });

  test("rejects a feature whose needs the runtime does not provide", () => {
    expect(() =>
      // @ts-expect-error
      createFeatureHttp(resources).for(documentsFeature),
    ).not.toThrow();
  });

  test("exposes only declared needs to route handlers", () => {
    const routes = createFeatureHttp(resources)
      .for(projectsFeature)
      .controller("wiring-test")
      .get("/projects/:id", ({ params, projects }) => projects.find(params.id), {
        projects: true,
      })
      // @ts-expect-error
      .get("/documents/:id", ({ params, documents }) => documents.read(params.id), {
        projects: true,
      });
    expect(routes).toBeDefined();
  });

  test("requires the need's macro before a handler can use it", () => {
    const routes = createFeatureHttp(resources)
      .for(projectsFeature)
      .controller("wiring-test-macro")
      // @ts-expect-error
      .get("/projects/:id", ({ params, projects }) => projects.find(params.id));
    expect(routes).toBeDefined();
  });
});
