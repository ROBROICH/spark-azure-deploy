import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { fileHistory, files } from "@spark-workflow/core/documents/schema";
import { projectHistory, projects, topicHistory, topics } from "@spark-workflow/core/projects/schema";
import type { HttpJson } from "@spark-workflow/http-host";
import type { Static } from "@sinclair/typebox";
import { inArray } from "drizzle-orm";

import { supplementaryRequests } from "../src/db/schema.ts";
import type { UpdateSupplementaryRequestSchema } from "../src/db/schemas.ts";
import { createPostgresApp, databaseUrl } from "./support/postgres-app.ts";

process.env.AUTH_MODE = "disabled";

const describeDatabaseTests = databaseUrl === undefined ? describe.skip : describe;

describeDatabaseTests("supplementary request references stay inside the request's project", () => {
  const scope = () => ({
    projectId: crypto.randomUUID(),
    topicId: crypto.randomUUID(),
    documentId: crypto.randomUUID(),
  });
  const own = scope();
  const foreign = scope();
  const projectIds = [own.projectId, foreign.projectId];
  const requestId = crypto.randomUUID();
  let postgres: Awaited<ReturnType<typeof createPostgresApp>>;

  beforeAll(async () => {
    if (databaseUrl === undefined) {
      throw new Error("SUPPLEMENTARY_REQUESTS_MUTATION_DATABASE_URL is required");
    }
    postgres = await createPostgresApp(databaseUrl);
    await postgres.database.query(async (query) => {
      await query
        .insert(projects)
        .values(projectIds.map((id) => ({ id, createdById: crypto.randomUUID() })));
      await query.insert(topics).values(
        [own, foreign].map(({ projectId, topicId }) => ({
          id: topicId,
          projectId,
          name: "Noise",
          showInMvp: true,
          showInEwm: true,
          showInBeschluss: true,
        })),
      );
      await query.insert(files).values(
        [own, foreign].map(({ projectId, documentId }) => ({
          id: documentId,
          projectId,
          type: "DOCUMENT" as const,
          filename: "report.pdf",
          mimeType: "application/pdf",
          bucketPath: `${projectId}/report.pdf`,
          isDeleted: false,
        })),
      );
      await query
        .insert(supplementaryRequests)
        .values({ id: requestId, projectId: own.projectId, title: "Noise", priority: "must" });
    });
  });

  afterAll(async () => {
    await postgres.database.query(async (query) => {
      await query
        .delete(supplementaryRequests)
        .where(inArray(supplementaryRequests.projectId, projectIds));
      await query.delete(files).where(inArray(files.projectId, projectIds));
      await query.delete(fileHistory).where(inArray(fileHistory.projectId, projectIds));
      await query.delete(topics).where(inArray(topics.projectId, projectIds));
      await query.delete(topicHistory).where(inArray(topicHistory.projectId, projectIds));
      await query.delete(projects).where(inArray(projects.id, projectIds));
      await query.delete(projectHistory).where(inArray(projectHistory.id, projectIds));
      await query.delete(auditLogs).where(inArray(auditLogs.projectId, projectIds));
    });
    await postgres.close();
  });

  type References = Pick<Static<typeof UpdateSupplementaryRequestSchema>, "topicId" | "documentId">;

  const send = (method: string, path: string, body: HttpJson) =>
    postgres.app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  const writers = {
    create: (projectId: string, references: References) =>
      send("POST", `/projects/${projectId}/supplementary-requests`, {
        title: "Noise",
        priority: "must",
        ...references,
      }),
    update: (projectId: string, references: References) =>
      send("PATCH", `/projects/${projectId}/supplementary-requests/${requestId}`, references),
  };

  const foreignReferencesStored = async () =>
    (
      await postgres.database.query((query) =>
        query
          .select({
            topicId: supplementaryRequests.topicId,
            documentId: supplementaryRequests.documentId,
          })
          .from(supplementaryRequests)
          .where(inArray(supplementaryRequests.projectId, projectIds)),
      )
    )
      .flatMap(({ topicId, documentId }) => [topicId, documentId])
      .filter((id) => id !== null && id !== own.topicId && id !== own.documentId);

  for (const [writer, write] of Object.entries(writers)) {
    for (const [reference, references] of [
      ["another project's topic", { topicId: foreign.topicId }],
      ["another project's document", { documentId: foreign.documentId }],
      ["a missing topic", { topicId: crypto.randomUUID() }],
      ["a missing document", { documentId: crypto.randomUUID() }],
    ] as const) {
      test(`${writer} rejects ${reference} with 422 and stores nothing`, async () => {
        const response = await write(own.projectId, references);

        expect(response.status).toBe(422);
        expect(await foreignReferencesStored()).toEqual([]);
      });
    }
  }

  test("create and update still accept the project's own topic and document", async () => {
    const references = { topicId: own.topicId, documentId: own.documentId };

    const created = await writers.create(own.projectId.toUpperCase(), references);
    const updated = await writers.update(own.projectId, references);

    expect(created.status).toBe(201);
    expect(await created.json()).toMatchObject({ projectId: own.projectId, ...references });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ id: requestId, ...references });
  });
});
