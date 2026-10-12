import {describe, expect, test} from "bun:test";

import {type RetainedChildCatalog} from "../src/temporal/norm-contracts.ts";
import {runBatchMvpWorkflow, runInsertRechtsmethodikResultsWorkflow, runInsertSuzResultsWorkflow, runMvpWorkflow, runSuzWorkflow, } from "../src/temporal/norm-logic.ts";
import {createRetainedChildFixture} from "../src/temporal/retained-children.ts";

const catalog: RetainedChildCatalog = await Bun.file(
  new URL("../fixtures/retained-child-outcomes.json", import.meta.url),
).json();
const childFixture = createRetainedChildFixture(catalog);
type WrittenFundstelle = {
  payload: { satzId: string; dokumentId: string };
};

describe("AOS norm workflow application logic", () => {
  test("runs the retained child on a cache miss, saves, then inserts", async () => {
    const rechtsmethodik = catalog.fixtures.find(({ kind }) => kind === "rechtsmethodik");
    if (rechtsmethodik?.kind !== "rechtsmethodik")
      throw new Error("missing rechtsmethodik fixture");
    const calls: Array<{ name: string; input: unknown }> = [];
    const result = await runMvpWorkflow(
      {
        projectId: "00000000-0000-4000-8000-000000005101",
        jurabk: "BNatSchG",
        paragraphNr: "44",
      },
      {
        workflowId: "mvp-fixture",
        getNormDeconstruction: async (input) => {
          calls.push({ name: "cache", input });
          return undefined;
        },
        runRechtsmethodik: async (input, childId) => {
          calls.push({ name: childId, input });
          return childFixture.rechtsmethodik(input);
        },
        saveNormDeconstruction: async (input) => {
          calls.push({ name: "save", input });
        },
        insertRechtsmethodikResults: async (input, childId) => {
          calls.push({ name: childId, input });
          return [
            {
              gesetzId: "00000000-0000-4000-8000-000000005202",
              normId: "00000000-0000-4000-8000-000000005203",
              skipped: false,
              nodesInserted: 4,
            },
          ];
        },
      },
    );

    expect(result).toEqual({
      projectId: "00000000-0000-4000-8000-000000005101",
      jurabk: "BNatSchG",
      paragraphNr: "44",
      skipped: false,
      gesetzId: "00000000-0000-4000-8000-000000005202",
      normId: "00000000-0000-4000-8000-000000005203",
    });
    expect(calls.map(({ name }) => name)).toEqual([
      "cache",
      "mvp-fixture-rechtsmethodik",
      "save",
      "mvp-fixture-insert-rm",
    ]);
    expect(calls[1]?.input).toEqual(rechtsmethodik.input);
    expect(calls[2]?.input).toEqual({
      jurabk: "BNatSchG",
      paragraphNr: "44",
      deconstruction: rechtsmethodik.output,
    });
  });

  test.each([false, true])(
    "preserves completed norm work and fails incomplete batches: %s",
    async (failChild) => {
      const norms = Array.from({ length: 7 }, (_, index) => ({
        jurabk: `G${index}`,
        paragraphNr: String(index + 1),
        topicNorms: [],
      }));
      let active = 0;
      let maximumActive = 0;
      const childIds: string[] = [];
      const pending = runBatchMvpWorkflow(
        { projectId: "00000000-0000-4000-8000-000000005101" },
        {
          workflowId: "batch-fixture",
          fetchProjectNorms: async () => norms,
          processCachedNormDeconstructions: async () => ({
            results: [
              {
                projectId: "00000000-0000-4000-8000-000000005101",
                jurabk: "cached",
                paragraphNr: "0",
                skipped: true,
                gesetzId: null,
                normId: null,
              },
            ],
            uncachedNorms: norms,
          }),
          runMvp: async (input, childId, index) => {
            childIds.push(childId);
            active += 1;
            maximumActive = Math.max(maximumActive, active);
            await Bun.sleep(3);
            active -= 1;
            if (failChild && index === 2) throw new Error("fixture child failure");
            return {
              projectId: input.projectId,
              jurabk: input.jurabk,
              paragraphNr: input.paragraphNr,
              skipped: false,
              gesetzId: null,
              normId: null,
            };
          },
        },
      );

      if (failChild) {
        await expect(pending).rejects.toMatchObject({
          type: "IncompleteNormBatch",
          details: [[{ jurabk: "G2", paragraphNr: "3" }]],
        });
      } else {
        const output = await pending;
        expect(output.results.map(({ jurabk }) => jurabk)).toEqual([
          "cached",
          "G0",
          "G1",
          "G2",
          "G3",
          "G4",
          "G5",
          "G6",
        ]);
      }
      expect(maximumActive).toBe(5);
      expect(childIds).toHaveLength(norms.length);
    },
  );

  test("derives the exact Satz input/identity and inserts retained outcomes in source order", async () => {
    const satz = catalog.fixtures.find(({ kind }) => kind === "satz");
    if (satz?.kind !== "satz") throw new Error("missing satz fixture");
    const exactInput = structuredClone(satz.input);
    let inserted: unknown;
    const childIds: string[] = [];
    const result = await runSuzWorkflow(
      {
        projectId: exactInput.projectId,
        normId: exactInput.normId,
        data: null,
      },
      {
        workflowId: "suz-fixture",
        newId: () => "00000000-0000-4000-8000-000000009001",
        fetchNormData: async () => exactInput.data,
        fetchDocumentNodes: async () => ({ documents: exactInput.documentNodes, sources: [] }),
        fetchNormExaminationIds: async () => ({
          gesetzId: exactInput.gesetzId,
          satzIdLookup: { "1:1:0": exactInput.satzId },
          satzUpdatedAt: { [exactInput.satzId]: "2026-10-05T00:00:00.000Z" },
          sources: [],
        }),
        runSatz: async (input, childId) => {
          childIds.push(childId);
          return childFixture.satz(input);
        },
        insertResults: async (input) => {
          inserted = input;
          return { fundstellenInserted: 1, skipped: false, inserts: [] };
        },
      },
    );

    expect(childIds).toEqual(["suz-fixture--absatz_1-satz_1_0-0"]);
    expect(result).toEqual({
      norm: exactInput.norm,
      satzResults: [satz.output],
    });
    expect(inserted).toEqual({
      projectId: exactInput.projectId,
      satzOrchestratorOutputs: [satz.output],
      resultId: "00000000-0000-4000-8000-000000009001",
      satzUpdatedAt: { [exactInput.satzId]: "2026-10-05T00:00:00.000Z" },
      sources: [],
    });
  });

  test("returns a successful empty procedural norm but rejects eligible Sätze missing TBMs", async () => {
    const base = {
      gesetz: "Verfahrensgesetz",
      jurabk: "VwVfG",
      paragraph: null,
      paragraphNr: "1",
      paragraphTitel: "Verfahren",
      absaetze: [
        {
          absatzNr: "1",
          absatzText: "Verfahren",
          saetze: [
            {
              id: null,
              satzNr: "1",
              position: 0,
              satzText: "Verfahrenssatz",
              normTypLvl1: "verfahrensrechtlich",
              normTypLvl2: "sonstiges",
              tatbestandsmerkmale: [],
              atomareTatbestandsmerkmale: [],
            },
          ],
        },
      ],
    };
    const operations = {
      workflowId: "empty-suz",
      newId: () => crypto.randomUUID(),
      fetchNormData: async () => base,
      fetchDocumentNodes: async () => ({ documents: [], sources: [] }),
      fetchNormExaminationIds: async () => ({
        gesetzId: "unused",
        satzIdLookup: {},
        satzUpdatedAt: {},
        sources: [],
      }),
      runSatz: async () => {
        throw new Error("unexpected Satz child");
      },
      insertResults: async () => ({
        fundstellenInserted: 0,
        skipped: true,
        inserts: [],
      }),
    };
    expect(
      runSuzWorkflow(
        {
          projectId: crypto.randomUUID(),
          normId: crypto.randomUUID(),
          data: null,
        },
        operations,
      ),
    ).resolves.toEqual({
      norm: "Verfahrensgesetz (VwVfG) § 1 Verfahren",
      satzResults: [],
    });

    const eligible = structuredClone(base);
    eligible.absaetze[0]!.saetze[0]!.normTypLvl1 = "materiell-rechtlich";
    eligible.absaetze[0]!.saetze[0]!.normTypLvl2 = "wenn-dann";
    expect(
      runSuzWorkflow(
        {
          projectId: crypto.randomUUID(),
          normId: crypto.randomUUID(),
          data: eligible,
        },
        operations,
      ),
    ).rejects.toThrow("should have TBMs");
  });

  test("re-reads Rechtsmethodik graph state after a write conflict and accepts the reconciled no-op", async () => {
    const retained = catalog.fixtures.find(({ kind }) => kind === "rechtsmethodik");
    if (retained?.kind !== "rechtsmethodik") throw new Error("missing rechtsmethodik fixture");
    const normResult = retained.output;
    const projectId = "00000000-0000-4000-8000-000000005101";
    const topicId = "00000000-0000-4000-8000-000000005601";
    const topicNormId = "00000000-0000-4000-8000-000000005602";
    const gesetzId = "00000000-0000-4000-8000-000000005603";
    const normId = "00000000-0000-4000-8000-000000005604";
    const absatzId = "00000000-0000-4000-8000-000000005605";
    const satzId = "00000000-0000-4000-8000-000000005606";
    let contextReads = 0;
    let writes = 0;
    let nextId = 700;
    const sleeps: string[] = [];

    const output = await runInsertRechtsmethodikResultsWorkflow(
      { projectId: projectId, normResults: [normResult] },
      {
        newId: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
        fetchPlsTopicNorms: async () => [
          {
            id: topicNormId,
            nodeType: "topic_norm",
            topicId: topicId,
            subtopicId: null,
            jurabk: "BNatSchG",
            paragraphNr: "44",
          },
        ],
        fetchExaminationContext: async () => {
          contextReads += 1;
          if (contextReads === 1) {
            return { gesetze: [], norms: [], absaetze: [], saetze: [] };
          }
          return {
            gesetze: [
              {
                nodeType: "gesetz",
                id: gesetzId,
                jurabk: "BNatSchG",
                frontendParentIds: [`topic:${topicId}`],
              },
            ],
            norms: [
              {
                nodeType: "norm",
                id: normId,
                gesetzId: gesetzId,
                paragraphNr: "44",
                frontendParentIds: [`topic_norm:${topicNormId}`],
              },
            ],
            absaetze: [
              {
                nodeType: "absatz",
                id: absatzId,
                normId: normId,
                absatzNr: "1",
              },
            ],
            saetze: [
              {
                nodeType: "satz",
                id: satzId,
                absatzId: absatzId,
                satzNr: "1",
                markers: ["Nr. 1"],
              },
            ],
          };
        },
        writeResult: async () => {
          writes += 1;
          throw new Error("409 concurrent graph write");
        },
        sleep: async (duration) => {
          sleeps.push(duration);
        },
      },
    );

    expect(output).toEqual([
      {
        gesetzId: gesetzId,
        normId: normId,
        skipped: true,
        nodesInserted: 0,
      },
    ]);
    expect(contextReads).toBe(2);
    expect(writes).toBe(1);
    expect(sleeps).toEqual(["2 seconds"]);
  });

  test("bounds per-Satz result insertion at ten and maps chunk and DMS document fallbacks", async () => {
    const retained = catalog.fixtures.find(({ kind }) => kind === "satz");
    if (retained?.kind !== "satz") throw new Error("missing satz fixture");
    const base = retained.output;
    const original = base.originaltexte[0];
    if (original === undefined) throw new Error("missing Satz source fixture");
    const outputs = Array.from({ length: 11 }, (_, index) => ({
      ...structuredClone(base),
      satzId: `satz-${index}`,
      originaltexte: [
        {
          ...structuredClone(original),
          documentId: `dms-${index}`,
          chunkIds: [`chunk-${index}-b`, `chunk-${index}-a`, `chunk-${index}-b`],
        },
      ],
    }));
    let active = 0;
    let maximumActive = 0;
    let nextId = 800;
    const resolved: string[][] = [];
    const writes: Array<{ inserts: unknown[] }> = [];

    const result = await runInsertSuzResultsWorkflow(
      {
        projectId: "00000000-0000-4000-8000-000000005101",
        satzOrchestratorOutputs: outputs,
        resultId: "00000000-0000-4000-8000-000000009001",
        satzUpdatedAt: Object.fromEntries(
          outputs.map(({ satzId }) => [satzId, "2026-10-05T00:00:00.000Z"]),
        ),
        sources: [],
      },
      {
        newId: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
        fetchExistingDokumente: async () => ({ "dms-10": "document-fallback" }),
        resolveChunkDokumente: async ({ chunkIds }) => {
          resolved.push(chunkIds);
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await Bun.sleep(3);
          active -= 1;
          const index = Number(chunkIds[0]!.split("-")[1]);
          return index === 10 ? {} : { [`chunk-${index}-a`]: `document-${index}` };
        },
        writeSatzFundstellen: async ({ inserts }) => {
          writes.push({ inserts });
          return {
            fundstellenInserted: inserts.length,
            skipped: inserts.length === 0,
            inserts,
          };
        },
      },
    );

    expect(result).toEqual({
      fundstellenInserted: 11,
      skipped: false,
      inserts: [],
    });
    expect(maximumActive).toBe(10);
    expect(resolved).toHaveLength(11);
    expect(resolved[0]).toEqual(["chunk-0-a", "chunk-0-b"]);
    expect(writes).toHaveLength(11);
    const writtenFundstellen = writes
      .flatMap(({ inserts }) => inserts)
      .map((insert) => insert as WrittenFundstelle);
    const first = writtenFundstellen.find(({ payload }) => payload.satzId === "satz-0");
    const fallback = writtenFundstellen.find(({ payload }) => payload.satzId === "satz-10");
    expect(first?.payload.dokumentId).toBe("document-0");
    expect(fallback?.payload.dokumentId).toBe("document-fallback");
  });
});
