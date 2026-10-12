import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { fileHistory, files } from "@spark-workflow/core/documents/schema";
import { projectHistory, projects, topicHistory, topics } from "@spark-workflow/core/projects/schema";
import type { HttpJson } from "@spark-workflow/http-host";
import { eq } from "drizzle-orm";

import { supplementaryRequests } from "../src/db/schema.ts";
import { createPostgresApp, databaseUrl } from "./support/postgres-app.ts";

process.env.AUTH_MODE = "disabled";

const projectId = crypto.randomUUID();
const topicId = crypto.randomUUID();
const documentId = crypto.randomUUID();
const collectionPath = `/api/v2/supplementary-requests/projects/${projectId}/supplementary-requests`;
const itemPath = (requestId: string) => `${collectionPath}/${requestId}`;
const url = (path: string) => `http://localhost${path}`;
const json = (method: string, body: HttpJson): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});
const createBody = {
  title: "Environmental impact report",
  reason: "The submitted material does not cover the project footprint.",
  priority: "must",
  sourceRef: { type: "materialNorm", itemId: "norm-42" },
  includedInLetter: true,
  topicId,
  documentId,
} satisfies HttpJson;

describe.skipIf(databaseUrl === undefined)("Supplementary Requests v2 REST contract", () => {
  let postgres: Awaited<ReturnType<typeof createPostgresApp>>;

  const stored = () =>
    postgres.database.query((query) =>
      query
        .select()
        .from(supplementaryRequests)
        .where(eq(supplementaryRequests.projectId, projectId)),
    );

  beforeAll(async () => {
    postgres = await createPostgresApp(databaseUrl!);
    await postgres.database.query(async (query) => {
      await query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() });
      await query.insert(topics).values({
        id: topicId,
        projectId,
        name: "Noise",
        showInMvp: true,
        showInEwm: true,
        showInBeschluss: true,
      });
      await query.insert(files).values({
        id: documentId,
        projectId,
        type: "DOCUMENT",
        filename: "report.pdf",
        mimeType: "application/pdf",
        bucketPath: `${projectId}/report.pdf`,
        isDeleted: false,
      });
    });
  });

  afterAll(async () => {
    if (!postgres) return;
    await postgres.database.query(async (query) => {
      await query
        .delete(supplementaryRequests)
        .where(eq(supplementaryRequests.projectId, projectId));
      await query.delete(files).where(eq(files.projectId, projectId));
      await query.delete(fileHistory).where(eq(fileHistory.projectId, projectId));
      await query.delete(topics).where(eq(topics.projectId, projectId));
      await query.delete(topicHistory).where(eq(topicHistory.projectId, projectId));
      await query.delete(projects).where(eq(projects.id, projectId));
      await query.delete(projectHistory).where(eq(projectHistory.id, projectId));
      await query.delete(auditLogs).where(eq(auditLogs.projectId, projectId));
    });
    await postgres.close();
  });

  test("creates, reads, updates and deletes a request with its stored state", async () => {
    const created = await postgres.app.handle(
      new Request(url(collectionPath), json("POST", createBody)),
    );
    expect(created.status).toBe(201);
    const request = (await created.json()) as { id: string };
    expect(request).toMatchObject({ projectId, ...createBody });

    const fetched = await postgres.app.handle(new Request(url(itemPath(request.id))));
    expect(fetched.status).toBe(200);
    expect(await fetched.json()).toMatchObject({ id: request.id, title: createBody.title });

    const updated = await postgres.app.handle(
      new Request(url(itemPath(request.id)), json("PATCH", { title: "Updated report" })),
    );
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ id: request.id, title: "Updated report" });
    expect((await stored()).map(({ title }) => title)).toEqual(["Updated report"]);

    const deleted = await postgres.app.handle(
      new Request(url(itemPath(request.id)), { method: "DELETE" }),
    );
    expect(deleted.status).toBe(200);
    expect(await deleted.json()).toMatchObject({ id: request.id, projectId });
    expect(await stored()).toEqual([]);
  });

  test("answers 404 for a request that does not exist", async () => {
    const missing = itemPath(crypto.randomUUID());
    for (const init of [undefined, json("PATCH", { title: "x" }), { method: "DELETE" }]) {
      const response = await postgres.app.handle(new Request(url(missing), init));
      expect(response.status).toBe(404);
    }
  });

  test("pages with named filters and follows the returned cursor", async () => {
    for (const [title, priority, itemId] of [
      ["First", "must", "norm-1"],
      ["Second", "must", "norm-2"],
      ["Other", "should", "norm-3"],
    ]) {
      const response = await postgres.app.handle(
        new Request(
          url(collectionPath),
          json("POST", {
            ...createBody,
            title,
            priority,
            sourceRef: { type: "materialNorm", itemId },
          }),
        ),
      );
      expect(response.status).toBe(201);
    }
    const filters = `includedInLetter=true&priority=must&sourceType=materialNorm&topicId=${topicId}&documentId=${documentId}`;

    const first = await postgres.app.handle(
      new Request(url(`${collectionPath}?${filters}&limit=1&page=1`)),
    );
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      data: Array<{ title: string }>;
      pagination: { page: number; limit: number; total: number; nextCursor: string };
    };
    expect(firstBody.data.map(({ title }) => title)).toEqual(["First"]);
    expect(firstBody.pagination).toMatchObject({ page: 1, limit: 1, total: 2 });

    const next = await postgres.app.handle(
      new Request(
        url(`${collectionPath}?${filters}&limit=1&cursor=${firstBody.pagination.nextCursor}`),
      ),
    );
    expect(next.status).toBe(200);
    expect(
      ((await next.json()) as { data: Array<{ title: string }> }).data.map(({ title }) => title),
    ).toEqual(["Second"]);
  });

  test("defaults to 50 and rejects undeclared or repeated scalar parameters", async () => {
    const response = await postgres.app.handle(new Request(url(collectionPath)));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ pagination: { page: 1, limit: 50 } });

    for (const query of [
      "unknown=x",
      "limit=1&limit=2",
      "projectVersion=1&projectVersion=2",
      "page=1&cursor=MA",
      "includedInLetter=true&includedInLetter=false",
      "priority=must&priority=should",
      "sourceType=manual&sourceType=materialNorm",
      `topicId=${topicId}&topicId=${projectId}`,
      `documentId=${documentId}&documentId=${projectId}`,
    ]) {
      const invalid = await postgres.app.handle(new Request(url(`${collectionPath}?${query}`)));
      expect(invalid.status, query).toBe(400);
      expect(await invalid.json()).toEqual({ detail: expect.any(String) });
    }

    const tooLarge = await postgres.app.handle(new Request(url(`${collectionPath}?limit=201`)));
    expect(tooLarge.status).toBe(422);
  });
});
