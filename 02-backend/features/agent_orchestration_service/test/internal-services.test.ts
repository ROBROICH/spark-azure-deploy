import { expect, expectTypeOf, test } from "bun:test";
import { fail } from "node:assert";
import { examinationErrors } from "@spark-workflow/examination-service/resource";
import { examinationReader, nodeFixture } from "./support/node-fixtures.ts";
import type { RiskInsertPayload } from "@spark-workflow/administrative-file-draft";
import { runWithProjectContext } from "@spark-temporal/typescript/context";
import { projectErrors } from "@spark-workflow/core/projects/data";
import { ApplicationFailure } from "@temporalio/common";
import { Result } from "better-result";

import {
  createAosInternalActivityDependencies,
  type AosInternalServices,
} from "../src/internal-services.ts";
import { createAssessmentActivities } from "../src/temporal/assessment-activities.ts";
import { NODE_VERSION_CONFLICT_TYPE } from "../src/temporal/workflow-contracts.ts";

const projectId = "00000000-0000-4000-8000-000000000001";
const lawId = "00000000-0000-4000-8000-000000000002";
const normId = "00000000-0000-4000-8000-000000000003";
const paragraphId = "00000000-0000-4000-8000-000000000004";
const sentenceId = "00000000-0000-4000-8000-000000000005";
const unexpected = () => fail("Unrelated service operation must not be called");

function services(
  rows: Parameters<typeof examinationReader>[0],
  updateExaminationNodes: AosInternalServices["examination"]["updateNodes"] = unexpected,
): AosInternalServices {
  const nodes = Object.values(rows).flat();
  const readNodes = examinationReader(rows);
  const graph = {
    async listNodes() {
      return nodes.map(({ id, nodeType }) => ({
        id,
        nodeType,
        parents: [],
        frontendParentIds: [],
        isOutdated: false,
      }));
    },
    copyVersion: unexpected,
    undoVersion: unexpected,
    updateNodes: unexpected,
  };
  return {
    examination: {
      ...graph,
      updateNodes: updateExaminationNodes,
      replaceAssessment: unexpected,
      replaceFundstellen: unexpected,
      async batchNodes(id, _version, table, ids) {
        return (
          await readNodes(
            id,
            ids.map((id) => ({ id })),
            table,
          )
        ).results;
      },
      getNormDeconstructions: unexpected,
      saveNormDeconstructions: unexpected,
    },
    projectLogic: { ...graph, batchNodes: unexpected },
    administrativeFileDraft: {
      ...graph,
      batchNodes: unexpected,
      assignTemplate: unexpected,
      getRisks: unexpected,
    },
    fppFiles: { getFile: unexpected, confirmDownload: unexpected },
    projects: {
      resolveLatestVersion: unexpected,
      validateWriteVersion: unexpected,
      projectTypeId: unexpected,
      validateVersionLock: unexpected,
      getTopic: unexpected,
      listTopics: unexpected,
      listTopicNorms: unexpected,
      batchNodes: unexpected,
      executeNodeMutation: unexpected,
    },
    get documents() {
      return fail("Documents must not be accessed");
    },
    get formalCompleteness() {
      return fail("Formal Completeness must not be accessed");
    },
    get plausibility() {
      return fail("Plausibility must not be accessed");
    },
  };
}

test("gathers Bewertung context through the internal node adapter without losing fields", async () => {
  const internal = createAosInternalActivityDependencies(
    services({
      gesetz: [nodeFixture("gesetz", { id: lawId, name: "Testgesetz", jurabk: "TestG" })],
      norm: [
        nodeFixture("norm", {
          id: normId,
          gesetzId: lawId,
          paragraphNr: "1",
          paragraphTitel: "Zweck",
          text: "Normtext",
        }),
      ],
      absatz: [nodeFixture("absatz", { id: paragraphId, normId })],
      satz: [
        nodeFixture("satz", {
          id: sentenceId,
          absatzId: paragraphId,
          text: "Satztext",
          normTypLvl1: "materiell-rechtlich",
          normTypLvl2: "wenn-dann",
        }),
      ],
    }),
  );
  const activity = createAssessmentActivities({
    ...internal,
    get objections() {
      return fail("Objections must not be accessed");
    },
    suz: { startAndAwait: unexpected },
  });

  const context = await runWithProjectContext({ projectId, projectVersion: 1 }, () =>
    activity.gatherNormContext({ projectId, normId }),
  );

  expect(context).toMatchObject({
    gesetzName: "Testgesetz",
    jurabk: "TestG",
    paragraphNr: "1",
    paragraphTitel: "Zweck",
    paragraphText: "Normtext",
    saetze: [
      {
        satzId: sentenceId,
        updatedAt: "1970-01-01T00:00:00.000Z",
        needsRefresh: false,
        satzText: "Satztext",
        normTypLvl1: "materiell-rechtlich",
        normTypLvl2: "wenn-dann",
        atomareTbm: [],
        rechtsfolge: null,
        fundstellen: [],
      },
    ],
  });
});

test("infers node fields and requires a risk status", async () => {
  const internal = createAosInternalActivityDependencies(
    services({
      norm: [nodeFixture("norm", { id: normId, gesetzId: lawId })],
    }),
  );
  const { results } = await runWithProjectContext({ projectId, projectVersion: 1 }, () =>
    internal.examination.batchGetNodes(projectId, [{ nodeType: "norm", id: normId }], "norm"),
  );
  const row = results[0];
  if (row === undefined) fail("Expected the norm");
  expectTypeOf(row.gesetzId).toEqualTypeOf<string>();
  expectTypeOf(row.nodeType).toEqualTypeOf<"norm">();
  expectTypeOf<RiskInsertPayload["status"]>().toEqualTypeOf<"open" | "corrected" | "ignored">();
  expectTypeOf<
    {} extends Pick<RiskInsertPayload, "status"> ? true : false
  >().toEqualTypeOf<false>();
  expect(row.gesetzId).toBe(lawId);
});

test("fails a node write on a project version conflict instead of retrying it", async () => {
  const internal = createAosInternalActivityDependencies(
    services({}, async () => {
      throw projectErrors.CONFLICT({ message: "Project version 1 is not the latest version 2" });
    }),
  );

  const failure = await runWithProjectContext({ projectId, projectVersion: 1 }, () =>
    internal.examination.updateNodes(projectId, { inserts: [], updates: [], deletes: [] }),
  ).then(
    () => fail("A version conflict must fail the node write"),
    (error: Error) => error,
  );

  expect(failure).toBeInstanceOf(ApplicationFailure);
  expect(failure instanceof ApplicationFailure && failure.type).toBe(NODE_VERSION_CONFLICT_TYPE);
});

test("does not keep retrying a result whose admitted evidence changed", async () => {
  const dependencies = services({});
  dependencies.examination.replaceAssessment = async () => {
    throw examinationErrors.PROCESSING_SOURCE_CHANGED();
  };
  const internal = createAosInternalActivityDependencies(dependencies);
  await expect(
    runWithProjectContext({ projectId, projectVersion: 1 }, () =>
      internal.examination.replaceAssessment(projectId, {
        satzId: sentenceId,
        bewertungId: crypto.randomUUID(),
        sources: [],
        inserts: [],
      }),
    ),
  ).rejects.toMatchObject({
    type: examinationErrors.PROCESSING_SOURCE_CHANGED.code,
    nonRetryable: true,
  });
});

test.each([
  ["assessment", "successor"],
  ["assessment", "active lock"],
  ["assessment", "absent project"],
  ["fundstellen", "successor"],
  ["fundstellen", "active lock"],
  ["fundstellen", "absent project"],
] as const)("%s terminates only a proven superseded version: %s", async (operation, outcome) => {
  const original = projectErrors.CONFLICT({ message: "Project version 1 is not writable" });
  const dependencies = services({});
  const requestedVersions: number[] = [];
  dependencies.projects.resolveLatestVersion = async () =>
    outcome === "absent project"
      ? Result.err(projectErrors.NOT_FOUND())
      : Result.ok(outcome === "successor" ? 2 : 1);
  dependencies.examination.replaceAssessment = async (_projectId, version) => {
    requestedVersions.push(version);
    throw original;
  };
  dependencies.examination.replaceFundstellen = async (_projectId, version) => {
    requestedVersions.push(version);
    throw original;
  };
  const internal = createAosInternalActivityDependencies(dependencies);
  const result = runWithProjectContext({ projectId, projectVersion: 1 }, () =>
    operation === "assessment"
      ? internal.examination.replaceAssessment(projectId, {
          satzId: sentenceId,
          bewertungId: crypto.randomUUID(),
          sources: [],
          inserts: [],
        })
      : internal.examination.replaceFundstellen(projectId, {
          satzId: sentenceId,
          satzUpdatedAt: new Date(0).toISOString(),
          resultId: crypto.randomUUID(),
          sources: [],
          inserts: [],
        }),
  );
  if (outcome === "successor") {
    await expect(result).rejects.toMatchObject({
      type: NODE_VERSION_CONFLICT_TYPE,
      nonRetryable: true,
    });
  } else {
    await expect(result).rejects.toBe(original);
  }
  expect(requestedVersions).toEqual([1]);
});
