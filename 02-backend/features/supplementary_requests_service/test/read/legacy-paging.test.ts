import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";

import { supplementaryRequests } from "../../src/db/schema.ts";
import { createPostgresApp, databaseUrl } from "../support/postgres-app.ts";

process.env.AUTH_MODE = "disabled";

const describeDatabaseTests = databaseUrl === undefined ? describe.skip : describe;

describeDatabaseTests("legacy supplementary request list paging", () => {
  const projectId = crypto.randomUUID();
  const createdAt = new Date("2026-09-01T08:00:00.000Z");
  const ids = Array.from({ length: 120 }, () => crypto.randomUUID()).sort();
  let postgres: Awaited<ReturnType<typeof createPostgresApp>>;

  beforeAll(async () => {
    if (databaseUrl === undefined) {
      throw new Error("SUPPLEMENTARY_REQUESTS_MUTATION_DATABASE_URL is required");
    }
    postgres = await createPostgresApp(databaseUrl);
    await postgres.database.query((query) =>
      query.insert(supplementaryRequests).values(
        ids.map((id, index) => ({
          id,
          projectId,
          title: index === 119 ? "Beyond the first page" : "Paging",
          priority: "must" as const,
          createdAt,
          updatedAt: createdAt,
          includedInLetter: index >= 10,
          sourceType: "requiredDocuments" as const,
          sourceItemId: id,
        })),
      ),
    );
  });

  afterAll(async () => {
    await postgres.database.query((query) =>
      query.delete(supplementaryRequests).where(eq(supplementaryRequests.projectId, projectId)),
    );
    await postgres.close();
  });

  async function list(query: string) {
    const response = await postgres.app.handle(
      new Request(`http://localhost/projects/${projectId}/supplementary-requests${query}`),
    );
    const body: unknown = await response.json();
    return {
      status: response.status,
      ids: Array.isArray(body) ? body.map((request: { id: string }) => request.id) : body,
    };
  }

  test("bounds the list to 50 by default and 200 at most", async () => {
    expect(await list("")).toEqual({ status: 200, ids: ids.slice(0, 50) });
    expect(await list("?limit=200")).toEqual({ status: 200, ids });
    expect((await list("?limit=500")).status).toBe(422);
  });

  test("reaches every request exactly once through offset pages of 50 in both directions", async () => {
    const pages = async (sort: string) =>
      (
        await Promise.all([0, 50, 100].map((offset) => list(`?sort=${sort}&offset=${offset}`)))
      ).flatMap((page) => page.ids);

    expect(await pages("created_at:asc")).toEqual(ids);
    expect(await pages("created_at:desc")).toEqual([...ids].reverse());
  });

  test("searches the complete request dataset before taking a page", async () => {
    expect(await list("?search=Beyond&limit=50")).toEqual({ status: 200, ids: [ids[119]] });
  });

  test("builds the letter from every included request independently of list pages", async () => {
    expect(await list("/letter-items")).toEqual({ status: 200, ids: ids.slice(10) });
  });

  test("finds source references beyond the first list page", async () => {
    const response = await postgres.app.handle(
      new Request(`http://localhost/projects/${projectId}/supplementary-requests/sources`),
    );
    expect(response.status).toBe(200);
    const body = await response.json() as Array<{ type: string; itemId: string }>;
    expect(body).toContainEqual({ type: "requiredDocuments", itemId: ids[119] });
  });
});
