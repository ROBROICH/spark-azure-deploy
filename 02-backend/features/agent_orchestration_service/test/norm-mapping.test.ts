import { describe, expect, test } from "bun:test";
import type {
  RechtsmethodikWorkflowOutput as RechtsmethodikResult,
  SatzOrchestratorWorkflowOutput as SatzChildOutput,
} from "@spark-temporal/contracts";
import { buildRechtsmethodikWritePlan, mapFundstellen } from "@spark-temporal/contracts";

import { type RetainedChildCatalog } from "../src/temporal/norm-contracts.ts";

const catalog: RetainedChildCatalog = await Bun.file(
  new URL("../fixtures/retained-child-outcomes.json", import.meta.url),
).json();

function retainedRechtsmethodik(): RechtsmethodikResult {
  const fixture = catalog.fixtures.find(({ kind }) => kind === "rechtsmethodik");
  if (fixture?.kind !== "rechtsmethodik") throw new Error("missing Rechtsmethodik fixture");
  return structuredClone(fixture.output);
}

describe("Rechtsmethodik nested graph mapping", () => {
  test("maps one representative Rechtsfolge and atomic TBM subtree in source order", () => {
    let nextId = 1;
    const plan = buildRechtsmethodikWritePlan(
      [
        {
          normResult: retainedRechtsmethodik(),
          topicNorms: [
            {
              id: "topic-norm",
              topicId: "topic-owner",
              subtopicId: null,
              jurabk: "BNatSchG",
              paragraphNr: "44",
            },
          ],
        },
      ],
      { gesetze: [], norms: [], absaetze: [], saetze: [] },
      () => `generated-${nextId++}`,
    );

    expect(plan.updates).toEqual([]);
    expect(plan.inserts.map(({ nodeType }) => nodeType)).toEqual([
      "gesetz",
      "norm",
      "absatz",
      "satz",
      "rechtsfolge",
      "sollensanordnungen",
      "adressat",
      "ermessensspielraum",
      "ermessensart",
      "expliziter_verweis",
      "impliziter_verweis",
      "atomares_tbm",
      "technische_norm",
      "bestimmter_rechtsbegriff",
      "legaldefinition",
      "unbestimmter_rechtsbegriff",
      "auslegungsvorschlag",
      "expliziter_verweis",
      "impliziter_verweis",
    ]);
    expect(plan.inserts.slice(4)).toEqual([
      {
        nodeType: "rechtsfolge",
        id: "generated-5",
        payload: {
          satzId: "generated-4",
          text: "Die Toetung ist verboten.",
        },
      },
      {
        nodeType: "sollensanordnungen",
        id: "generated-6",
        payload: {
          rechtsfolgeId: "generated-5",
          kategorie: "verbot",
        },
      },
      {
        nodeType: "adressat",
        id: "generated-7",
        payload: {
          rechtsfolgeId: "generated-5",
          entscheidung: "handlungsermächtigung",
        },
      },
      {
        nodeType: "ermessensspielraum",
        id: "generated-8",
        payload: {
          rechtsfolgeId: "generated-5",
          entscheidung: "ermessensentscheidung",
        },
      },
      {
        nodeType: "ermessensart",
        id: "generated-9",
        payload: {
          rechtsfolgeId: "generated-5",
          art: "entschließungsermessen",
        },
      },
      {
        nodeType: "expliziter_verweis",
        id: "generated-10",
        payload: {
          rechtsfolgeId: "generated-5",
          gesetz: "BNatSchG",
          paragraphNr: "45",
          absatzNr: null,
          satzNr: null,
          untergliederung: [],
          verweisTyp: "intern",
          kontext: ["Ausnahme"],
        },
      },
      {
        nodeType: "impliziter_verweis",
        id: "generated-11",
        payload: {
          rechtsfolgeId: "generated-5",
          rationale: "Artenschutzrechtlicher Zusammenhang",
        },
      },
      {
        nodeType: "atomares_tbm",
        id: "generated-12",
        payload: {
          satzId: "generated-4",
          text: "wild lebendes Tier",
          prueffrage: "Ist ein wild lebendes Tier betroffen?",
          pruefgegenstand: "Tier",
        },
      },
      {
        nodeType: "technische_norm",
        id: "generated-13",
        payload: {
          atomaresTbmId: "generated-12",
          name: "Artenschutzkartierung",
          confidence: 1,
        },
      },
      {
        nodeType: "bestimmter_rechtsbegriff",
        id: "generated-14",
        payload: {
          atomaresTbmId: "generated-12",
          begriff: "Tier",
        },
      },
      {
        nodeType: "legaldefinition",
        id: "generated-15",
        payload: {
          bestimmterRechtsbegriffId: "generated-14",
          begriff: "Tier",
          definition: "Lebender Organismus",
          sourceJurabk: "BNatSchG",
          sourceParagraphNr: "7",
        },
      },
      {
        nodeType: "unbestimmter_rechtsbegriff",
        id: "generated-16",
        payload: {
          atomaresTbmId: "generated-12",
          begriff: "wild lebend",
          auslegung: "In freier Natur lebend",
        },
      },
      {
        nodeType: "auslegungsvorschlag",
        id: "generated-17",
        payload: {
          unbestimmterRechtsbegriffId: "generated-16",
          methode: "wortlaut",
          text: "Nicht domestiziert",
        },
      },
      {
        nodeType: "expliziter_verweis",
        id: "generated-18",
        payload: {
          atomaresTbmId: "generated-12",
          gesetz: "BImSchG",
          paragraphNr: "5",
          absatzNr: "1",
          satzNr: "1",
          untergliederung: [{ typ: "nummer", wert: "1" }],
          verweisTyp: "extern",
          kontext: null,
        },
      },
      {
        nodeType: "impliziter_verweis",
        id: "generated-19",
        payload: {
          atomaresTbmId: "generated-12",
          rationale: "Schutzpflicht",
        },
      },
    ]);
  });

  test("plans one law for multiple norms in one atomic batch", () => {
    const first = retainedRechtsmethodik();
    first.absaetze = [];
    const second = retainedRechtsmethodik();
    second.paragraphNr = "45";
    second.paragraphTitel = "§ 45";
    second.paragraphText = "Second norm";
    second.absaetze = [];
    let nextId = 1;

    const plan = buildRechtsmethodikWritePlan(
      [
        {
          normResult: first,
          topicNorms: [
            {
              id: "topic-norm-44",
              topicId: "topic-owner",
              jurabk: first.jurabk,
              paragraphNr: first.paragraphNr,
            },
          ],
        },
        {
          normResult: second,
          topicNorms: [
            {
              id: "topic-norm-45",
              topicId: "topic-owner",
              jurabk: second.jurabk,
              paragraphNr: second.paragraphNr,
            },
          ],
        },
      ],
      { gesetze: [], norms: [], absaetze: [], saetze: [] },
      () => `generated-${nextId++}`,
    );

    expect(plan.inserts.map(({ nodeType }) => nodeType)).toEqual(["gesetz", "norm", "norm"]);
    expect(
      plan.results.map(({ gesetzId, insertedGesetz, insertedNorm }) => ({
        gesetzId,
        insertedGesetz,
        insertedNorm,
      })),
    ).toEqual([
      { gesetzId: "generated-1", insertedGesetz: true, insertedNorm: true },
      { gesetzId: "generated-1", insertedGesetz: false, insertedNorm: true },
    ]);
  });
});

describe("Fundstelle mapping", () => {
  const satzOutput = (entries: SatzChildOutput["originaltexte"]): SatzChildOutput => ({
    satzId: "satz-1",
    gesetzId: "gesetz-1",
    normId: "norm-1",
    originaltexte: entries,
  });

  test("passes the reliability values of a scored result through to the insert payload", () => {
    const inserts = mapFundstellen(
      satzOutput([
        {
          nodeId: "node-1",
          documentId: "dms-1",
          title: "Standortbeschreibung",
          text: "Der Standort liegt 400 m vom Schutzgebiet entfernt.",
          chunkIds: ["chunk-1"],
          pageNumbers: [7],
          consensusRatio: 1,
          relevance: 0.9,
          confidence: 0.95,
        },
      ]),
      { "chunk-1": "dokument-1" },
      {},
      () => "generated-1",
    );

    expect(inserts).toEqual([
      {
        nodeType: "fundstelle",
        id: "generated-1",
        payload: {
          satzId: "satz-1",
          gesetzId: "gesetz-1",
          normId: "norm-1",
          dokumentId: "dokument-1",
          sourceNodeId: "node-1",
          chunkIds: ["chunk-1"],
          title: "Standortbeschreibung",
          text: "Der Standort liegt 400 m vom Schutzgebiet entfernt.",
          pageNumbers: [7],
          frontendParentIds: ["chunk:chunk-1"],
          confidence: 0.95,
          consensusRatio: 1,
          relevance: 0.9,
        },
      },
    ]);
  });

  test("maps an absent consensus rate to a null column value", () => {
    const [firstInsert] = mapFundstellen(
      satzOutput([
        {
          nodeId: "node-2",
          documentId: "dms-2",
          title: null,
          text: "Die Anlage wird im Jahr 2027 errichtet.",
          chunkIds: ["chunk-2"],
          pageNumbers: [],
          consensusRatio: null,
          relevance: 0.7,
          confidence: 0.7,
        },
      ]),
      { "chunk-2": "dokument-2" },
      {},
      () => "generated-2",
    );

    expect(firstInsert?.payload).toMatchObject({
      confidence: 0.7,
      consensusRatio: null,
      relevance: 0.7,
    });
  });

  test("stores no value for a result that carries no reliability signal", () => {
    const [firstInsert] = mapFundstellen(
      satzOutput([
        {
          nodeId: "node-3",
          documentId: "dms-3",
          title: null,
          text: "Anlage 3 zum Antrag.",
          chunkIds: ["chunk-3"],
          pageNumbers: [],
        },
      ]),
      { "chunk-3": "dokument-3" },
      {},
      () => "generated-3",
    );

    expect(firstInsert?.payload).toMatchObject({
      confidence: null,
      consensusRatio: null,
      relevance: null,
    });
  });
});
