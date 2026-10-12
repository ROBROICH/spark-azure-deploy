import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { ProjectVersions } from "@spark-workflow/core/projects/data";
import { projectLogicSchema, projects } from "@spark-workflow/core/projects/schema";
import { bindNodeRuntime } from "@spark-workflow/node-crud";
import { createPostgresRuntime } from "@spark-workflow/postgres-runtime";
import { eq } from "drizzle-orm";

import {
  examinationSchema,
  gesetz,
  norm,
  absatz,
  satz,
  dokument,
  markdownText,
  fundstelle,
  fundstelleHistory,
  bewertung,
} from "../src/db/schema.ts";
import { examinationDescriptor } from "../src/node/descriptor.ts";
import {
  processingSourceDigest,
  replaceAssessment,
  replaceFundstellen,
  type FundstellenReplacement,
  type ProcessingSourceRevision,
} from "../src/resource/processing.ts";

const url = process.env.EXAMINATION_TEST_DATABASE_URL;
describe.skipIf(url === undefined)("processing replacement in one PostgreSQL transaction", () => {
  const postgres = createPostgresRuntime({
    url: url!,
    schema: { ...projectLogicSchema, ...examinationSchema },
  });
  const runtime = bindNodeRuntime(examinationDescriptor, {
    persistence: postgres.scope(examinationSchema),
    versionPeer: new ProjectVersions(postgres.scope(projectLogicSchema)),
  });
  const projectIds: string[] = [];
  beforeAll(() => postgres.ready());
  afterAll(async () => {
    await postgres.query(async (db) => {
      for (const id of projectIds) await db.delete(projects).where(eq(projects.id, id));
    });
    await postgres.close();
  });

  async function seed() {
    const ids = {
      project: crypto.randomUUID(),
      law: crypto.randomUUID(),
      norm: crypto.randomUUID(),
      paragraph: crypto.randomUUID(),
      satz: crypto.randomUUID(),
      document: crypto.randomUUID(),
      markdown: crypto.randomUUID(),
    };
    projectIds.push(ids.project);
    await postgres.query(async (db) => {
      await db.insert(projects).values({ id: ids.project, createdById: crypto.randomUUID() });
      await db
        .insert(gesetz)
        .values({ id: ids.law, projectId: ids.project, name: "Law", jurabk: "G" });
      await db.insert(norm).values({
        id: ids.norm,
        projectId: ids.project,
        gesetzId: ids.law,
        paragraphNr: "1",
        text: "norm",
      });
      await db.insert(absatz).values({
        id: ids.paragraph,
        projectId: ids.project,
        normId: ids.norm,
        absatzNr: "1",
        text: "paragraph",
      });
      await db.insert(satz).values({
        id: ids.satz,
        projectId: ids.project,
        absatzId: ids.paragraph,
        satzNr: "1",
        text: "sentence",
      });
      await db
        .insert(markdownText)
        .values({ id: ids.markdown, projectId: ids.project, text: "document" });
      await db.insert(dokument).values({
        id: ids.document,
        projectId: ids.project,
        filename: "report.pdf",
        mimeType: "application/pdf",
        pageCount: 1,
        dmsFileId: crypto.randomUUID(),
        markdownTextId: ids.markdown,
        summary: "report",
      });
    });
    const snapshot = async () =>
      postgres.query(async (db) => {
        const [sentence] = await db.select().from(satz).where(eq(satz.id, ids.satz));
        const [document] = await db.select().from(dokument).where(eq(dokument.id, ids.document));
        const evidence = (
          await db.select().from(fundstelle).where(eq(fundstelle.satzId, ids.satz))
        ).filter(({ isDeleted }) => !isDeleted);
        return {
          satzUpdatedAt: sentence!.updatedAt.toISOString(),
          sources: [
            ...evidence.map((row) => ({
              nodeType: "fundstelle",
              id: row.id,
              updatedAt: row.updatedAt.toISOString(),
              digest: processingSourceDigest(row),
              isOutdated: row.isOutdated,
            })),
            {
              nodeType: "satz",
              id: ids.satz,
              updatedAt: sentence!.updatedAt.toISOString(),
              digest: processingSourceDigest(sentence!),
              isOutdated: false,
            },
            {
              nodeType: "dokument",
              id: ids.document,
              updatedAt: document!.updatedAt.toISOString(),
              digest: processingSourceDigest(document!),
              isOutdated: false,
            },
          ],
        };
      });
    const citation = (nodeId: string, text = nodeId) => ({
      nodeType: "fundstelle",
      id: crypto.randomUUID(),
      payload: {
        satzId: ids.satz,
        gesetzId: ids.law,
        normId: ids.norm,
        dokumentId: ids.document,
        sourceNodeId: nodeId,
        title: nodeId,
        text,
        chunkIds: [],
        pageNumbers: [],
        frontendParentIds: [],
        confidence: null,
        consensusRatio: null,
        relevance: null,
      },
    });
    const visible = () =>
      postgres
        .query((db) => db.select().from(fundstelle).where(eq(fundstelle.projectId, ids.project)))
        .then((rows) => rows.filter(({ isDeleted }) => !isDeleted));
    return { ids, snapshot, citation, visible };
  }

  test("reconciles changed and empty results while keeping stable, manual, and legacy identities", async () => {
    const f = await seed();
    const x = f.citation("X"),
      y = f.citation("Y"),
      manual = f.citation("manual"),
      legacy = f.citation("legacy");
    await postgres.query((db) =>
      db.insert(fundstelle).values([
        { ...manual.payload, id: manual.id, projectId: f.ids.project, updateType: "MANUAL" },
        { ...legacy.payload, id: legacy.id, projectId: f.ids.project, sourceNodeId: null },
      ]),
    );
    const first: FundstellenReplacement = {
      resultId: crypto.randomUUID(),
      satzId: f.ids.satz,
      ...(await f.snapshot()),
      inserts: [x, y],
    };
    await replaceFundstellen(runtime, f.ids.project, 1, first);
    await replaceFundstellen(runtime, f.ids.project, 1, first);
    expect((await f.visible()).map(({ id }) => id).sort()).toEqual(
      [x.id, y.id, manual.id, legacy.id].sort(),
    );
    await replaceFundstellen(runtime, f.ids.project, 1, {
      resultId: crypto.randomUUID(),
      satzId: f.ids.satz,
      ...(await f.snapshot()),
      inserts: [f.citation("Y")],
    });
    expect((await f.visible()).map(({ id }) => id).sort()).toEqual(
      [y.id, manual.id, legacy.id].sort(),
    );
    const history = await postgres.query((db) =>
      db.select().from(fundstelleHistory).where(eq(fundstelleHistory.id, x.id)),
    );
    expect(history.some(({ sourceNodeId }) => sourceNodeId === "X")).toBe(true);
    const empty: FundstellenReplacement = {
      resultId: crypto.randomUUID(),
      satzId: f.ids.satz,
      ...(await f.snapshot()),
      inserts: [],
    };
    await replaceFundstellen(runtime, f.ids.project, 1, empty);
    const accepted = await f.snapshot();
    await replaceFundstellen(runtime, f.ids.project, 1, empty);
    expect(await f.snapshot()).toEqual(accepted);
    await expect(replaceFundstellen(runtime, f.ids.project, 1, first)).rejects.toThrow(
      "Processing sources changed",
    );
    expect((await f.visible()).map(({ id }) => id).sort()).toEqual([manual.id, legacy.id].sort());
  });

  test("refreshes an unchanged automated outdated citation without replacing its identity", async () => {
    const f = await seed();
    const citation = f.citation("unchanged-source");
    await replaceFundstellen(runtime, f.ids.project, 1, {
      resultId: crypto.randomUUID(),
      satzId: f.ids.satz,
      ...(await f.snapshot()),
      inserts: [citation],
    });
    await postgres.query((db) =>
      db.update(fundstelle).set({ isOutdated: true }).where(eq(fundstelle.id, citation.id)),
    );
    await replaceFundstellen(runtime, f.ids.project, 1, {
      resultId: crypto.randomUUID(),
      satzId: f.ids.satz,
      ...(await f.snapshot()),
      inserts: [f.citation("unchanged-source")],
    });
    const active = await f.visible();
    expect(active).toHaveLength(1);
    expect(active[0]?.id).toBe(citation.id);
    expect(active[0]?.isOutdated).toBe(false);
    expect(active[0]?.updateType).toBe("AUTOMATED");
    const history = await postgres.query((db) =>
      db.select().from(fundstelleHistory).where(eq(fundstelleHistory.id, citation.id)),
    );
    expect(history.some(({ isOutdated }) => isOutdated)).toBe(true);
  });

  test("does not remove a generated citation omitted from the admitted snapshot", async () => {
    const f = await seed();
    const citation = f.citation("newly-visible-source");
    await replaceFundstellen(runtime, f.ids.project, 1, {
      resultId: crypto.randomUUID(),
      satzId: f.ids.satz,
      ...(await f.snapshot()),
      inserts: [citation],
    });
    const snapshot = await f.snapshot();
    await expect(
      replaceFundstellen(runtime, f.ids.project, 1, {
        resultId: crypto.randomUUID(),
        satzId: f.ids.satz,
        ...snapshot,
        sources: snapshot.sources.filter(({ nodeType }) => nodeType !== "fundstelle"),
        inserts: [],
      }),
    ).rejects.toThrow("Processing sources changed");
    expect((await f.visible()).map(({ id }) => id)).toEqual([citation.id]);
  });

  test("rejects changed admission state and keeps distinct equal-text source nodes", async () => {
    const f = await seed();
    const input = {
      resultId: crypto.randomUUID(),
      satzId: f.ids.satz,
      ...(await f.snapshot()),
      inserts: [f.citation("A", "same"), f.citation("B", "same")],
    };
    await replaceFundstellen(runtime, f.ids.project, 1, input);
    expect(await f.visible()).toHaveLength(2);
    const next = { ...input, resultId: crypto.randomUUID(), ...(await f.snapshot()), inserts: [] };
    await postgres.query((db) =>
      db
        .update(satz)
        .set({
          text: "human revision",
          updateType: "MANUAL",
          updatedAt: new Date(Date.now() + 1000),
        })
        .where(eq(satz.id, f.ids.satz)),
    );
    await expect(replaceFundstellen(runtime, f.ids.project, 1, next)).rejects.toThrow(
      "Processing sources changed",
    );
    expect(await f.visible()).toHaveLength(2);
  });

  test("rolls back replacement on invalid insertion and rejects stale evidence before promotion", async () => {
    const f = await seed();
    const oldId = crypto.randomUUID(),
      oldMarkdown = crypto.randomUUID();
    const evidence = f.citation("assessment-source");
    await postgres.query(async (db) => {
      await db
        .insert(fundstelle)
        .values({ ...evidence.payload, id: evidence.id, projectId: f.ids.project });
      await db
        .insert(markdownText)
        .values({ id: oldMarkdown, projectId: f.ids.project, text: "old assessment" });
      await db.insert(bewertung).values({
        id: oldId,
        projectId: f.ids.project,
        satzId: f.ids.satz,
        markdownTextId: oldMarkdown,
        result: "old",
        norm: "§ 1",
        isOutdated: true,
      });
    });
    const snap = await f.snapshot();
    const [source] = await postgres.query((db) =>
      db.select().from(fundstelle).where(eq(fundstelle.id, evidence.id)),
    );
    const evidenceRevision = {
      nodeType: "fundstelle",
      id: evidence.id,
      updatedAt: source!.updatedAt.toISOString(),
      digest: processingSourceDigest(source!),
      isOutdated: false,
    };
    const sources: ProcessingSourceRevision[] = [evidenceRevision, ...snap.sources];
    const id = crypto.randomUUID();
    const invalid = {
      satzId: f.ids.satz,
      bewertungId: id,
      sources,
      inserts: [
        {
          nodeType: "bewertung",
          id,
          payload: {
            satzId: f.ids.satz,
            markdownTextId: crypto.randomUUID(),
            result: "new",
            norm: "§ 1",
          },
        },
      ],
    };
    await expect(replaceAssessment(runtime, f.ids.project, 1, invalid)).rejects.toThrow();
    const old = await postgres.query((db) =>
      db.select().from(bewertung).where(eq(bewertung.id, oldId)),
    );
    expect(old[0]?.isDeleted).toBe(false);
    const freshMarkdown = crypto.randomUUID();
    const valid = {
      ...invalid,
      inserts: [
        { nodeType: "markdown_text", id: freshMarkdown, payload: { text: "new assessment" } },
        {
          ...invalid.inserts[0]!,
          payload: { ...invalid.inserts[0]!.payload, markdownTextId: freshMarkdown },
        },
      ],
    };
    await postgres.query((db) =>
      db.update(dokument).set({ isOutdated: true }).where(eq(dokument.id, f.ids.document)),
    );
    await expect(replaceAssessment(runtime, f.ids.project, 1, valid)).rejects.toThrow(
      "Processing sources changed",
    );
    expect(
      (await postgres.query((db) => db.select().from(bewertung).where(eq(bewertung.id, oldId))))[0]
        ?.isDeleted,
    ).toBe(false);
    await postgres.query((db) =>
      db.update(dokument).set({ isOutdated: false }).where(eq(dokument.id, f.ids.document)),
    );
    const refreshed = await f.snapshot();
    const admitted = {
      ...valid,
      sources: [evidenceRevision, ...refreshed.sources],
    };
    await postgres.query((db) =>
      db
        .update(fundstelle)
        .set({ text: "changed excerpt", updatedAt: new Date(Date.now() + 1000) })
        .where(eq(fundstelle.id, evidence.id)),
    );
    await expect(replaceAssessment(runtime, f.ids.project, 1, admitted)).rejects.toThrow(
      "Processing sources changed",
    );
    const [currentEvidence] = await postgres.query((db) =>
      db.select().from(fundstelle).where(eq(fundstelle.id, evidence.id)),
    );
    const current = {
      ...admitted,
      sources: admitted.sources.map((revision) =>
        revision.nodeType === "fundstelle"
          ? {
              ...revision,
              updatedAt: currentEvidence!.updatedAt.toISOString(),
              digest: processingSourceDigest(currentEvidence!),
            }
          : revision,
      ),
    };
    await replaceAssessment(runtime, f.ids.project, 1, current);
    await replaceAssessment(runtime, f.ids.project, 1, current);
    const assessments = await postgres.query((db) =>
      db.select().from(bewertung).where(eq(bewertung.projectId, f.ids.project)),
    );
    expect(assessments.filter(({ isDeleted }) => !isDeleted).map(({ id }) => id)).toEqual([id]);
    expect(assessments.find((row) => row.id === oldId)?.isDeleted).toBe(true);
  });
  test("rejects changed content even when PostgreSQL keeps the same transaction timestamp", async () => {
    const f = await seed();
    const evidence = f.citation("same-timestamp-source");
    const before = await postgres.transact(async () =>
      postgres.query(async (db) => {
        await db
          .insert(fundstelle)
          .values({ ...evidence.payload, id: evidence.id, projectId: f.ids.project });
        const [row] = await db.select().from(fundstelle).where(eq(fundstelle.id, evidence.id));
        await db
          .update(fundstelle)
          .set({ text: "changed within transaction" })
          .where(eq(fundstelle.id, evidence.id));
        return row!;
      }),
    );
    const [after] = await postgres.query((db) =>
      db.select().from(fundstelle).where(eq(fundstelle.id, evidence.id)),
    );
    expect(after!.updatedAt.toISOString()).toBe(before.updatedAt.toISOString());
    const snapshot = await f.snapshot();
    await expect(
      replaceAssessment(runtime, f.ids.project, 1, {
        satzId: f.ids.satz,
        bewertungId: crypto.randomUUID(),
        sources: [
          ...snapshot.sources,
          {
            nodeType: "fundstelle",
            id: evidence.id,
            updatedAt: before.updatedAt.toISOString(),
            digest: processingSourceDigest(before),
            isOutdated: false,
          },
        ],
        inserts: [],
      }),
    ).rejects.toThrow("Processing sources changed");
  });
});
