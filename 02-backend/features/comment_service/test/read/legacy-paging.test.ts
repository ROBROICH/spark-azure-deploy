import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createFeatureHttp, createHttpHost } from "@spark-workflow/http-host";
import { PostgreSQL } from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provide } from "@spark-workflow/resource";
import type { ResourceRuntime } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import { eq } from "drizzle-orm";

import { comments } from "../../src/db/schema.ts";
import { createRoutes, feature } from "../../src/index.ts";
import { type CommentDatabaseRuntime, createCommentDatabaseRuntime } from "../support/database.ts";

process.env.AUTH_MODE = "disabled";

const databaseUrl = process.env.COMMENT_DATABASE_URL;
const describeDatabaseTests = databaseUrl === undefined ? describe.skip : describe;

describeDatabaseTests("legacy comment list paging", () => {
  const projectId = crypto.randomUUID();
  const createdAt = new Date("2026-09-01T08:00:00.000Z");
  const ids = Array.from({ length: 120 }, () => crypto.randomUUID()).sort();
  let database: CommentDatabaseRuntime;
  let resources: ResourceRuntime<typeof PostgreSQL>;
  let app: { handle(request: Request): Promise<Response> };

  beforeAll(async () => {
    if (databaseUrl === undefined) throw new Error("COMMENT_DATABASE_URL is required");
    database = createCommentDatabaseRuntime(databaseUrl);
    await database.ready();
    await database.query((query) =>
      query.insert(comments).values(
        ids.map((id) => ({
          id,
          projectId,
          title: "Paging",
          content: "Paging",
          processStep: "unsorted" as const,
          createdAt,
          updatedAt: createdAt,
        })),
      ),
    );
    resources = makeEffectResourceRuntime(
      composeFeatures([
        feature,
        defineFeature({
          id: "comment-paging-platform",
          needs: {},
          providers: [provide({ resource: PostgreSQL, needs: {}, make: () => database })] as const,
          tables: {},
        }),
      ] as const),
    );
    app = createHttpHost("comment-paging-test").use(
      createRoutes(createFeatureHttp(resources).for(feature)),
    );
  });

  afterAll(async () => {
    await database.query((query) => query.delete(comments).where(eq(comments.projectId, projectId)));
    await resources.close();
    await database.close();
  });

  async function list(query: string) {
    const response = await app.handle(
      new Request(`http://localhost/projects/${projectId}/comments${query}`),
    );
    const body: unknown = await response.json();
    return {
      status: response.status,
      ids: Array.isArray(body) ? body.map((comment: { id: string }) => comment.id) : body,
    };
  }

  test("bounds the list to 50 by default and 200 at most", async () => {
    expect(await list("")).toEqual({ status: 200, ids: ids.slice(0, 50) });
    expect(await list("?limit=200")).toEqual({ status: 200, ids });
    expect((await list("?limit=500")).status).toBe(422);
  });

  test("reaches every comment exactly once through offset pages of 50", async () => {
    const pages = await Promise.all([0, 50, 100].map((offset) => list(`?offset=${offset}`)));

    expect(pages.map((page) => page.status)).toEqual([200, 200, 200]);
    expect(pages.flatMap((page) => page.ids)).toEqual(ids);
  });
});
