import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { asc, eq, inArray } from "drizzle-orm";

import type { NodeDatabase } from "../src";
import type { NodeJson } from "../src/values";
import { createFeedbackApp } from "./fixtures/feedback/app";
import { feedback, feedbackHistory, feedbackSchema } from "./fixtures/feedback/schema";
import { createNodeTestDatabase } from "./support/database";

const databaseUrl = process.env.NODE_CRUD_TEST_URL;
const realPostgres = databaseUrl ? describe : describe.skip;

const MIXED_PROJECT = "71000000-0000-4000-8000-000000000001";
const NO_OP_PROJECT = "71000000-0000-4000-8000-000000000002";
const ROLLBACK_PROJECT = "71000000-0000-4000-8000-000000000003";
const INSERT_ID = "72000000-0000-4000-8000-000000000001";
const UPDATE_ID = "72000000-0000-4000-8000-000000000002";
const DELETE_ID = "72000000-0000-4000-8000-000000000003";
const NO_OP_ID = "72000000-0000-4000-8000-000000000004";
const ROLLBACK_INSERT_ID = "72000000-0000-4000-8000-000000000005";
const ROLLBACK_UPDATE_ID = "72000000-0000-4000-8000-000000000006";
const MISSING_DELETE_ID = "72000000-0000-4000-8000-000000000007";
const USER_ID = "73000000-0000-4000-8000-000000000001";

type App = ReturnType<typeof createFeedbackApp>;

const request = async (app: App, projectId: string, body: NodeJson) => {
  const response = await app.handle(
    new Request(`http://node-crud.test/${projectId}/update?projectVersion=1`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: (() => {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    })(),
  };
};

const seedFeedback = (
  database: NodeDatabase<typeof feedbackSchema>,
  values: {
    id: string;
    projectId: string;
    rating: "POSITIVE" | "NEGATIVE";
    text: string;
    updatedAt: Date;
  },
) =>
  database.insert(feedback).values({
    id: values.id,
    projectId: values.projectId,
    projectVersion: 1,
    createdAt: values.updatedAt,
    updatedAt: values.updatedAt,
    isDeleted: false,
    isOutdated: false,
    rating: values.rating,
    reason: null,
    text: values.text,
    userId: USER_ID,
  } as never);

realPostgres("audit-disabled Feedback node mutations", () => {
  let database: NodeDatabase<typeof feedbackSchema>;
  let closeDatabase: () => Promise<void>;
  let app: App;

  beforeAll(async () => {
    const testDatabase = await createNodeTestDatabase(databaseUrl!, feedbackSchema);
    database = testDatabase.database;
    closeDatabase = testDatabase.close;
    app = createFeedbackApp(testDatabase.persistence);
  });

  afterAll(async () => {
    const projects = [MIXED_PROJECT, NO_OP_PROJECT, ROLLBACK_PROJECT];
    try {
      await database.delete(feedback).where(inArray(feedback.projectId, projects));
      await database.delete(feedbackHistory).where(inArray(feedbackHistory.projectId, projects));
    } finally {
      await closeDatabase();
    }
  });

  test("commits mixed domain and trigger-history effects without an audit table", async () => {
    const seededAt = new Date("2026-07-17T08:00:00.000Z");
    await seedFeedback(database, {
      id: UPDATE_ID,
      projectId: MIXED_PROJECT,
      rating: "POSITIVE",
      text: "before update",
      updatedAt: seededAt,
    });
    await seedFeedback(database, {
      id: DELETE_ID,
      projectId: MIXED_PROJECT,
      rating: "NEGATIVE",
      text: "before delete",
      updatedAt: seededAt,
    });

    const mutation = await request(app, MIXED_PROJECT, {
      inserts: [
        {
          nodeType: "feedback",
          id: INSERT_ID,
          payload: {
            rating: "positive",
            reason: "useful",
            text: "inserted",
            userId: USER_ID,
          },
        },
      ],
      updates: [
        {
          nodeType: "feedback",
          id: UPDATE_ID,
          payload: { rating: "negative", reason: "changed", text: "after update" },
        },
      ],
      deletes: [{ nodeType: "feedback", id: DELETE_ID }],
    });

    expect(mutation.status).toBe(200);
    expect(mutation.body.inserted[0]).toMatchObject({
      id: INSERT_ID,
      rating: "positive",
      text: "inserted",
    });
    expect(mutation.body.updated[0]).toMatchObject({
      id: UPDATE_ID,
      rating: "negative",
      text: "after update",
    });
    expect(mutation.body.deleted).toEqual([{ nodeType: "feedback", id: DELETE_ID }]);

    expect(
      await database
        .select({
          id: feedback.id,
          rating: feedback.rating,
          text: feedback.text,
          isDeleted: feedback.isDeleted,
        })
        .from(feedback)
        .where(eq(feedback.projectId, MIXED_PROJECT))
        .orderBy(asc(feedback.id)),
    ).toEqual([
      { id: INSERT_ID, rating: "POSITIVE", text: "inserted", isDeleted: false },
      { id: UPDATE_ID, rating: "NEGATIVE", text: "after update", isDeleted: false },
      { id: DELETE_ID, rating: "NEGATIVE", text: "before delete", isDeleted: true },
    ]);
    expect(
      await database
        .select({
          id: feedbackHistory.id,
          text: feedbackHistory.text,
          isDeleted: feedbackHistory.isDeleted,
        })
        .from(feedbackHistory)
        .where(inArray(feedbackHistory.id, [UPDATE_ID, DELETE_ID]))
        .orderBy(asc(feedbackHistory.id)),
    ).toEqual([
      { id: UPDATE_ID, text: "before update", isDeleted: false },
      { id: DELETE_ID, text: "before delete", isDeleted: false },
    ]);
  });

  test("keeps an empty audit-disabled update as a no-op", async () => {
    const seededAt = new Date("2026-07-17T08:10:00.000Z");
    await seedFeedback(database, {
      id: NO_OP_ID,
      projectId: NO_OP_PROJECT,
      rating: "POSITIVE",
      text: "unchanged",
      updatedAt: seededAt,
    });

    expect(
      await request(app, NO_OP_PROJECT, {
        updates: [{ nodeType: "feedback", id: NO_OP_ID, payload: {} }],
      }),
    ).toEqual({ status: 200, body: { inserted: [], updated: [], deleted: [] } });
    expect(
      await database
        .select({ updatedAt: feedback.updatedAt, text: feedback.text })
        .from(feedback)
        .where(eq(feedback.id, NO_OP_ID)),
    ).toEqual([{ updatedAt: seededAt, text: "unchanged" }]);
    expect(
      await database
        .select({ id: feedbackHistory.id })
        .from(feedbackHistory)
        .where(eq(feedbackHistory.id, NO_OP_ID)),
    ).toEqual([]);
  });

  test("rolls back audit-disabled domain and history effects on failure", async () => {
    const seededAt = new Date("2026-07-17T08:20:00.000Z");
    await seedFeedback(database, {
      id: ROLLBACK_UPDATE_ID,
      projectId: ROLLBACK_PROJECT,
      rating: "POSITIVE",
      text: "rollback original",
      updatedAt: seededAt,
    });

    const mutation = await request(app, ROLLBACK_PROJECT, {
      inserts: [
        {
          nodeType: "feedback",
          id: ROLLBACK_INSERT_ID,
          payload: { rating: "positive", text: "must roll back", userId: USER_ID },
        },
      ],
      updates: [
        {
          nodeType: "feedback",
          id: ROLLBACK_UPDATE_ID,
          payload: { text: "must roll back" },
        },
      ],
      deletes: [{ nodeType: "feedback", id: MISSING_DELETE_ID }],
    });

    expect(mutation).toEqual({
      status: 404,
      body: "Delete batch affected fewer rows than expected",
    });
    expect(
      await database
        .select({ id: feedback.id, text: feedback.text })
        .from(feedback)
        .where(eq(feedback.projectId, ROLLBACK_PROJECT)),
    ).toEqual([{ id: ROLLBACK_UPDATE_ID, text: "rollback original" }]);
    expect(
      await database
        .select({ id: feedbackHistory.id })
        .from(feedbackHistory)
        .where(eq(feedbackHistory.projectId, ROLLBACK_PROJECT)),
    ).toEqual([]);
  });
});
