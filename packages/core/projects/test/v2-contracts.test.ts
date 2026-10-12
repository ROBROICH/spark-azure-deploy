import { describe, expect, test } from "bun:test";
import { createFeatureHttp, type HttpJson } from "@spark-workflow/http-host";

process.env.AUTH_MODE = "disabled";

const projectId = "71000000-0000-4000-8000-000000000001";

const request = (path: string, method = "GET", body?: HttpJson) => {
  const init: RequestInit = { method };
  if (body !== undefined) {
    init.headers = { "content-type": "application/json" };
    init.body = JSON.stringify(body);
  }
  return new Request(`http://core.test${path}`, init);
};

async function appForContracts() {
  const [{ coreFeature }, { createProjectV2Routes }] = await Promise.all([
    import("../../src/manifest.ts"),
    import("../src/v2-routes.ts"),
  ]);
  const runtime = {
    get: async () => {
      throw new Error("Invalid requests must fail before Core resources resolve");
    },
    ready: async () => undefined,
    close: async () => undefined,
  };
  return createProjectV2Routes(createFeatureHttp(runtime).for(coreFeature));
}

describe("Core v2 boundary contracts", () => {
  test("rejects every hand-written non-UUID path parameter before persistence", async () => {
    const app = await appForContracts();
    for (const path of [
      "/projects/not-a-uuid",
      "/projects/not-a-uuid/applicants?projectVersion=1",
      `/projects/${projectId}/applicants/not-a-uuid?projectVersion=1`,
      "/project-types/not-a-uuid",
      "/project-statuses/not-a-uuid",
      "/process-steps/not-a-uuid",
    ]) {
      expect((await app.handle(request(path))).status, path).toBe(422);
    }
  });

  test("rejects nullable project fields whose response contract is non-null", async () => {
    const app = await appForContracts();
    for (const body of [
      { name: null },
      { projectTypeId: null },
      { entryDate: null },
      { internalProjectNumber: null },
    ]) {
      const response = await app.handle(request(`/projects/${projectId}`, "PATCH", body));
      expect(response.status, JSON.stringify(body)).toBe(422);
    }
  });

  test("uses the domain deadline command instead of generated table bodies", async () => {
    const app = await appForContracts();
    const collection = `/projects/${projectId}/deadlines?projectVersion=1`;
    expect((await app.handle(request(collection, "POST", {}))).status).toBe(422);

    const create = {
      startAt: "2026-08-01",
      endAt: "2026-08-31",
      deadlineType: "Stellungnahme",
    };
    for (const internal of [
      { frontendParentIds: [] },
      { updateType: "manual" },
      { isOutdated: false },
    ]) {
      const response = await app.handle(request(collection, "POST", { ...create, ...internal }));
      expect(response.status, JSON.stringify(internal)).toBe(422);
    }

    const item = `/projects/${projectId}/deadlines/72000000-0000-4000-8000-000000000001?projectVersion=1`;
    for (const field of ["startAt", "endAt", "deadlineType"] as const) {
      const response = await app.handle(request(item, "PATCH", { [field]: null }));
      expect(response.status, field).toBe(422);
    }
    for (const internal of [
      { frontendParentIds: [] },
      { updateType: "manual" },
      { isOutdated: false },
    ]) {
      const response = await app.handle(request(item, "PATCH", internal));
      expect(response.status, JSON.stringify(internal)).toBe(422);
    }
  });
});
