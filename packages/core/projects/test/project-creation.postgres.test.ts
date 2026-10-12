import { afterAll, beforeAll, describe, expect, mock, spyOn, test } from "bun:test";
import { SQL } from "bun";
import * as authentication from "@spark-workflow/authentification";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { Result } from "better-result";
import { and, eq } from "drizzle-orm";

import { createUsecasesService } from "../../usecases/src/resource.ts";
import { usecaseWrite } from "../../usecases/test/memory.ts";
import { projectLogicSchema, subtopics, topicNorms, topics } from "../src/db/schema.ts";
import { seedCoreDatabase } from "../src/index.ts";
import { createProjectRecord } from "../src/project-creation.ts";

const databaseUrl = process.env.USECASE_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("project creation preserves catalog citations in PostgreSQL", () => {
  let database: PostgresResourceRuntime<typeof projectLogicSchema>;
  let control: SQL;
  const projectIds: string[] = [];
  const authorityId = crypto.randomUUID();

  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      !target.pathname.startsWith("/core_catalog_test_")
    ) {
      throw new Error(
        "USECASE_TEST_DATABASE_URL must name an isolated local core_catalog_test_ database",
      );
    }
    control = new SQL(databaseUrl!);
    database = createPostgresRuntime({ url: databaseUrl!, schema: projectLogicSchema });
    spyOn(authentication, "touchRelationship").mockResolvedValue(Result.ok(undefined));
    spyOn(authentication, "deleteRelationship").mockResolvedValue(Result.ok(undefined));
    await seedCoreDatabase(database);
  });

  afterAll(async () => {
    for (const projectId of projectIds) {
      await control`delete from project where id = ${projectId}`;
      await control`delete from project_history where id = ${projectId}`;
      await control`delete from topic_history where project_id = ${projectId}`;
      await control`delete from subtopic_history where project_id = ${projectId}`;
      await control`delete from topic_norm_history where project_id = ${projectId}`;
      await control`delete from audit_log where project_id = ${projectId}`;
    }
    await control`delete from usecase_document where authority_id = ${authorityId}`;
    await control`delete from project_type where id = ${authorityId}`;
    await control`delete from project_type_history where id = ${authorityId}`;
    await database.close();
    await control.close();
    mock.restore();
  });

  test("shipped FStrBAG section 2 persists all three qualified provisions", async () => {
    const scope = database.scope(projectLogicSchema);
    const created = (
      await createProjectRecord(
        scope,
        {
          projectTypeId: "00000000-0000-0000-0000-000000000000",
          name: "Catalog default test",
          internalProjectNumber: crypto.randomUUID(),
          createdById: crypto.randomUUID(),
          entryDate: "2026-10-05",
        },
        async ({ id }) => id,
      )
    ).unwrap();
    projectIds.push(created);
    const rows = await scope.query((db) =>
      db
        .select({
          absatz: topicNorms.absatz,
          satz: topicNorms.satz,
          nummer: topicNorms.nummer,
          type: topicNorms.type,
        })
        .from(topicNorms)
        .innerJoin(topics, eq(topicNorms.topicId, topics.id))
        .where(
          and(
            eq(topicNorms.projectId, created),
            eq(topics.name, "Zuständigkeit"),
            eq(topicNorms.jurabk, "FStrBAG"),
            eq(topicNorms.paragraphNr, "2"),
          ),
        )
        .orderBy(topicNorms.absatz),
    );
    expect(rows).toEqual([
      { absatz: "1", satz: "1", nummer: "4", type: "VERFAHREN" },
      { absatz: "2", satz: null, nummer: null, type: "VERFAHREN" },
      { absatz: "3", satz: null, nummer: null, type: "VERFAHREN" },
    ]);
  });

  test("subtopic aggregation keeps qualifiers and merges only matching parent associations", async () => {
    const scope = database.scope(projectLogicSchema);
    const write = usecaseWrite(authorityId, authorityId);
    const norm = {
      jurabk: "Catalog law",
      paragraphNr: "2",
      absatz: null,
      satz: null,
      nummer: null,
    };
    const visibility = { description: "", showInMvp: true, showInEwm: true, showInBeschluss: true };
    const references = ["absatz", "satz", "nummer"].flatMap((qualifier) =>
      [null, "", " ", "null", "1"].map((value) => ({
        ...norm,
        jurabk: qualifier,
        [qualifier]: value,
      })),
    );
    const paragraph = { ...norm, jurabk: "Paragraph", paragraphNr: null };
    write.gesetzesgrundlage.topics = [
      {
        name: "Topic",
        ...visibility,
        pruefungsNorms: [paragraph],
        verfahrensNorms: [norm],
        subtopics: [
          {
            name: "First",
            ...visibility,
            pruefungsNorms: [...references, norm, paragraph],
            verfahrensNorms: [],
          },
          {
            name: "Second",
            ...visibility,
            pruefungsNorms: [...references, { ...paragraph, paragraphNr: "" }],
            verfahrensNorms: [norm],
          },
        ],
      },
    ];
    (await createUsecasesService(scope).create(write)).unwrap();
    const created = (
      await createProjectRecord(
        scope,
        {
          projectTypeId: authorityId,
          name: "Qualified defaults",
          internalProjectNumber: crypto.randomUUID(),
          createdById: crypto.randomUUID(),
          entryDate: "2026-10-05",
        },
        async ({ id }) => id,
      )
    ).unwrap();
    projectIds.push(created);
    const parents = await scope.query((db) =>
      db
        .select({ id: subtopics.id, name: subtopics.name })
        .from(subtopics)
        .where(eq(subtopics.projectId, created)),
    );
    const first = `subtopic:${parents.find(({ name }) => name === "First")!.id}`;
    const second = `subtopic:${parents.find(({ name }) => name === "Second")!.id}`;
    const rows = await scope.query((db) =>
      db
        .select({
          jurabk: topicNorms.jurabk,
          paragraphNr: topicNorms.paragraphNr,
          absatz: topicNorms.absatz,
          satz: topicNorms.satz,
          nummer: topicNorms.nummer,
          type: topicNorms.type,
          frontendParentIds: topicNorms.frontendParentIds,
        })
        .from(topicNorms)
        .where(eq(topicNorms.projectId, created)),
    );
    expect(rows).toHaveLength(references.length + 3);
    for (const reference of references) {
      expect(rows).toContainEqual({
        ...reference,
        type: "PRUEFUNG",
        frontendParentIds: [first, second],
      });
    }
    expect(rows).toContainEqual({
      ...paragraph,
      type: "PRUEFUNG",
      frontendParentIds: [first, second],
    });
    expect(rows).toContainEqual({ ...norm, type: "PRUEFUNG", frontendParentIds: [first] });
    expect(rows).toContainEqual({ ...norm, type: "VERFAHREN", frontendParentIds: [second] });
  });
});
