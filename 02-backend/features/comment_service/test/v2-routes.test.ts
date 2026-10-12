import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createFeatureHttp, createHttpHost } from "@spark-workflow/http-host";
import { PostgreSQL } from "@spark-workflow/postgres-runtime";
import type { ResourceRuntime, ResourceValue } from "@spark-workflow/resource";
import { eq } from "drizzle-orm";

import { comments } from "../src/db/schema.ts";
import { createV2Routes, feature } from "../src/index.ts";
import { createCommentDatabaseRuntime, type CommentDatabaseRuntime } from "./support/database.ts";

process.env.AUTH_MODE = "disabled";

const databaseUrl = process.env.COMMENT_MUTATION_DATABASE_URL;
const projectId = crypto.randomUUID();
const collectionPath = `/api/v2/comment/projects/${projectId}/comments`;
const itemPath = (commentId: string) => `${collectionPath}/${commentId}`;
const url = (path: string) => `http://localhost${path}`;
const json = (
  method: string,
  body: Readonly<Record<string, string | Readonly<Record<string, string>>>>,
): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const createBody = {
  title: "Review note",
  content: "Keep the public contract explicit.",
  processStep: "legalReview",
  sourceRef: { type: "materialNorm", itemId: "norm-42" },
} as const;

describe.skipIf(databaseUrl === undefined)("Comment v2 REST contract", () => {
  let database: CommentDatabaseRuntime;
  let app: { handle(request: Request): Promise<Response> };

  const stored = () =>
    database.query((client) =>
      client.select().from(comments).where(eq(comments.projectId, projectId)),
    );

  beforeAll(async () => {
    database = createCommentDatabaseRuntime(databaseUrl!);
    await database.ready();
    const resources: ResourceRuntime<typeof PostgreSQL> = {
      get: async <Value extends typeof PostgreSQL>() => database as ResourceValue<Value>,
      ready: async () => undefined,
      close: async () => undefined,
    };
    app = createHttpHost("comment-v2-test").group("/api/v2/comment", (group) =>
      group.use(createV2Routes(createFeatureHttp(resources).for(feature))),
    );
  });

  afterAll(async () => {
    if (!database) return;
    await database.query((client) =>
      client.delete(comments).where(eq(comments.projectId, projectId)),
    );
    await database.close();
  });

  test("creates, reads, updates and deletes a comment with its stored state", async () => {
    const created = await app.handle(new Request(url(collectionPath), json("POST", createBody)));
    expect(created.status).toBe(201);
    const comment = (await created.json()) as { id: string };
    expect(comment).toMatchObject({ projectId, ...createBody });

    const fetched = await app.handle(new Request(url(itemPath(comment.id))));
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toMatchObject({ id: comment.id, title: createBody.title });

    const updated = await app.handle(
      new Request(url(itemPath(comment.id)), json("PATCH", { title: "Updated note" })),
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ id: comment.id, title: "Updated note" });
    expect((await stored()).map(({ title }) => title)).toEqual(["Updated note"]);

    const deleted = await app.handle(new Request(url(itemPath(comment.id)), { method: "DELETE" }));
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ id: comment.id, projectId });
    expect(await stored()).toEqual([]);
  });

  test("answers 404 for a comment that does not exist", async () => {
    const missing = itemPath(crypto.randomUUID());
    for (const init of [undefined, json("PATCH", { title: "x" }), { method: "DELETE" }]) {
      const response = await app.handle(new Request(url(missing), init));
      expect(response.status).toBe(404);
    }
  });

  test("pages by named filters and follows the returned cursor", async () => {
    for (const title of ["First", "Second"]) {
      const response = await app.handle(
        new Request(url(collectionPath), json("POST", { ...createBody, title })),
      );
      expect(response.status).toBe(201);
    }
    await app.handle(
      new Request(
        url(collectionPath),
        json("POST", { ...createBody, title: "Other", processStep: "unsorted" }),
      ),
    );

    const first = await app.handle(
      new Request(
        url(`${collectionPath}?processStep=legalReview&sourceType=materialNorm&limit=1&page=1`),
      ),
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      data: Array<{ title: string }>;
      pagination: { page: number; limit: number; total: number; nextCursor: string };
    };
    expect(firstBody.data.map(({ title }) => title)).toEqual(["First"]);
    expect(firstBody.pagination).toMatchObject({ page: 1, limit: 1, total: 2 });

    const next = await app.handle(
      new Request(
        url(
          `${collectionPath}?processStep=legalReview&sourceType=materialNorm&limit=1&cursor=${firstBody.pagination.nextCursor}`,
        ),
      ),
    );
    expect(next.status).toBe(200);
    expect(
      ((await next.json()) as { data: Array<{ title: string }> }).data.map(({ title }) => title),
    ).toEqual(["Second"]);
  });

  test("defaults to 50 and rejects undeclared or ambiguous pagination", async () => {
    const response = await app.handle(new Request(url(collectionPath)));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ pagination: { page: 1, limit: 50 } });

    for (const query of ["unknown=x", "limit=1&limit=2", "projectVersion=1", "page=1&cursor=MA"]) {
      const invalid = await app.handle(new Request(url(`${collectionPath}?${query}`)));
      expect(invalid.status, query).toBe(400);
      expect(await invalid.json()).toEqual({ detail: expect.any(String) });
    }
    expect((await app.handle(new Request(url(`${collectionPath}?limit=201`)))).status).toBe(422);
  });

  test("rejects undeclared query parameters on item reads and mutations without writing", async () => {
    const before = await stored();
    const commentId = before[0]!.id;
    for (const [path, init] of [
      [collectionPath, json("POST", createBody)],
      [itemPath(commentId), undefined],
      [itemPath(commentId), json("PATCH", { title: "Changed" })],
      [itemPath(commentId), { method: "DELETE" }],
    ] as const) {
      const response = await app.handle(new Request(url(`${path}?unknown=x`), init));
      expect(response.status).toBe(400);
    }
    expect(await stored()).toEqual(before);
  });

  test.each([
    ["POST", 201, (content: string) => ({ title: "Note", content, processStep: "unsorted" })],
    ["PATCH", 200, (content: string) => ({ content })],
  ] as const)(
    "%s admits 50000 content characters and rejects 50001 with 422",
    async (method, admitted, body) => {
      const [target] = await stored();
      const path = method === "POST" ? collectionPath : itemPath(target!.id);
      const send = (content: string) =>
        app.handle(new Request(url(path), json(method, body(content))));
      expect((await send("c".repeat(50_000))).status).toBe(admitted);
      expect((await send("c".repeat(50_001))).status).toBe(422);
    },
  );

  test("still reads a stored comment whose content exceeds the write budget", async () => {
    const commentId = crypto.randomUUID();
    await database.query((client) =>
      client.insert(comments).values({
        id: commentId,
        projectId,
        title: "Imported",
        content: "c".repeat(50_001),
        processStep: "unsorted",
      }),
    );
    const response = await app.handle(new Request(url(itemPath(commentId))));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ content: "c".repeat(50_001) });
  });
});
