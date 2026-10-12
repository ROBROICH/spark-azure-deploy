import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { projects, projectVersionLocks, topicNorms, topics } from "@spark-workflow/core/projects/schema";
import { eq } from "drizzle-orm";

import {
  createLegalBasisFixture,
  databaseUrl,
  lawDocument,
  lawNorm,
  type LegalBasisFixture,
  type LawNormPayload,
} from "./support/legal-basis-postgres.ts";

process.env.AUTH_MODE = "disabled";
const realPostgres = databaseUrl ? describe : describe.skip;

realPostgres("legal-basis write admission against current Projects and Examination", () => {
  let fixture: LegalBasisFixture;
  let unavailable = false;
  let searchResults: LawNormPayload[] = [];
  let duringSearch: (() => Promise<void>) | undefined;
  const jurabk = `Admission-${crypto.randomUUID()}`;

  beforeAll(() => {
    fixture = createLegalBasisFixture(databaseUrl!, async (url) => {
      if (unavailable) return new Response("Law DB unavailable", { status: 503 });
      if (url.pathname === "/norms/search") {
        await duringSearch?.();
        return Response.json(searchResults);
      }
      if (url.pathname === `/documents/${jurabk}`) return Response.json(lawDocument(jurabk));
      return new Response("No matching Law DB resource", { status: 404 });
    });
  });
  afterAll(() => fixture?.close(), 60_000);

  async function addNorms(
    projectId: string,
    topicId: string,
    norms: { jurabk: string; paragraphNr: string }[],
  ) {
    return fixture.app.handle(
      new Request(
        `http://examination.test/legal-basis/projects/${projectId}/norms?projectVersion=1`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ topicId, norms }),
        },
      ),
    );
  }

  for (const versionState of ["locked", "stale"] as const) {
    for (const selection of ["empty", "nonempty", "already-selected"] as const) {
      test(`${versionState} version rejects ${selection} selection before Law DB and leaves both schemas unchanged`, async () => {
        unavailable = false;
        duringSearch = undefined;
        searchResults = [lawNorm(jurabk, "44")];
        const { projectId, topicId } = await fixture.createProject();
        const norms = selection === "empty" ? [] : [{ jurabk, paragraphNr: "44" }];
        if (selection === "already-selected") {
          const initial = await addNorms(projectId, topicId, norms);
          expect({ status: initial.status, body: await initial.json() }).toMatchObject({
            status: 200,
            body: { items: [{ createdTopicNorm: true, createdNorm: true }] },
          });
        }
        await fixture.postgres.query(async (database) => {
          if (versionState === "locked") {
            await database.insert(projectVersionLocks).values({
              id: crypto.randomUUID(),
              projectId,
              sourceVersion: 1,
              targetVersion: 2,
              lockToken: crypto.randomUUID(),
            });
          } else {
            const projectRows = await database
              .select()
              .from(projects)
              .where(eq(projects.id, projectId));
            const topicRows = await database
              .select()
              .from(topics)
              .where(eq(topics.projectId, projectId));
            const selectedRows = await database
              .select()
              .from(topicNorms)
              .where(eq(topicNorms.projectId, projectId));
            await database
              .insert(projects)
              .values(projectRows.map((row) => ({ ...row, projectVersion: 2 })));
            await database
              .insert(topics)
              .values(topicRows.map((row) => ({ ...row, projectVersion: 2 })));
            if (selectedRows.length > 0) {
              await database
                .insert(topicNorms)
                .values(selectedRows.map((row) => ({ ...row, projectVersion: 2 })));
            }
          }
        });
        unavailable = selection !== "already-selected";
        fixture.lawRequests.length = 0;
        const before = await fixture.graphSnapshot(projectId);
        const response = await addNorms(projectId, topicId, norms);
        expect({
          status: response.status,
          lawRequests: fixture.lawRequests.map((url) => url.pathname),
          database: await fixture.graphSnapshot(projectId),
        }).toEqual({ status: 409, lawRequests: [], database: before });
      });
    }
  }

  test("valid empty selection succeeds without Law DB or persistent changes", async () => {
    unavailable = true;
    duringSearch = undefined;
    const { projectId, topicId } = await fixture.createProject();
    fixture.lawRequests.length = 0;
    const before = await fixture.graphSnapshot(projectId);
    const response = await addNorms(projectId, topicId, []);
    expect({
      status: response.status,
      body: await response.json(),
      lawRequests: fixture.lawRequests.map((url) => url.pathname),
      database: await fixture.graphSnapshot(projectId),
    }).toEqual({ status: 200, body: { items: [] }, lawRequests: [], database: before });
  });

  test("a version lock acquired during Law DB preflight remains 409 without a partial topic/norm graph", async () => {
    unavailable = false;
    searchResults = [lawNorm(jurabk, "44")];
    const { projectId, topicId } = await fixture.createProject();
    const before = await fixture.graphSnapshot(projectId);
    duringSearch = async () => {
      await fixture.postgres.query((database) =>
        database.insert(projectVersionLocks).values({
          id: crypto.randomUUID(),
          projectId,
          sourceVersion: 1,
          targetVersion: 2,
          lockToken: crypto.randomUUID(),
        }),
      );
    };
    try {
      const response = await addNorms(projectId, topicId, [{ jurabk, paragraphNr: "44" }]);
      expect({ status: response.status, database: await fixture.graphSnapshot(projectId) }).toEqual(
        { status: 409, database: before },
      );
    } finally {
      duringSearch = undefined;
    }
  });

  test("missing and foreign-project topics remain 404 on a valid version", async () => {
    unavailable = true;
    duringSearch = undefined;
    const owner = await fixture.createProject();
    const other = await fixture.createProject();
    for (const topicId of [crypto.randomUUID(), other.topicId]) {
      const response = await addNorms(owner.projectId, topicId, []);
      expect(response.status).toBe(404);
    }
  });

  test("invalid, missing and ambiguous Law DB selections preserve their HTTP statuses", async () => {
    unavailable = false;
    duringSearch = undefined;
    const { projectId, topicId } = await fixture.createProject();
    const before = await fixture.graphSnapshot(projectId);
    for (const scenario of [
      { selection: { jurabk: " ", paragraphNr: "44" }, results: [], status: 422 },
      { selection: { jurabk, paragraphNr: "44" }, results: [], status: 404 },
      {
        selection: { jurabk, paragraphNr: "44" },
        results: [lawNorm(jurabk, "44"), lawNorm(jurabk, "44")],
        status: 409,
      },
    ]) {
      searchResults = scenario.results;
      const response = await addNorms(projectId, topicId, [scenario.selection]);
      expect({ status: response.status, database: await fixture.graphSnapshot(projectId) }).toEqual(
        { status: scenario.status, database: before },
      );
    }
  });
});
