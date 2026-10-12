import { describe, expect, test } from "bun:test";
import type { ObjectionsService } from "@spark-workflow/objections-management-service/resource";
import { runWithProjectContext } from "@spark-temporal/typescript/context";

import {
  createAosObjectionsService,
  ObjectionsProjectContextError,
} from "../src/objections.ts";

const projectId = "40000000-0000-4000-8000-000000000001";
const otherProjectId = "40000000-0000-4000-8000-000000000002";
const fileId = "50000000-0000-4000-8000-000000000001";
const entryId = "50000000-0000-4000-8000-000000000002";
const argumentId = "50000000-0000-4000-8000-000000000003";
const topicId = "50000000-0000-4000-8000-000000000004";

describe("AOS local Objections adapter", () => {
  test("passes the Temporal project version to every local Resource operation", async () => {
    const calls: Array<{
      operation: string;
      requestedProjectId: string;
      projectVersion: number;
      body?: unknown;
    }> = [];
    const resource: ObjectionsService = {
      async listProcessedFileIds(requestedProjectId, projectVersion) {
        calls.push({ operation: "list", requestedProjectId, projectVersion });
        return [fileId];
      },
      async storeExtractionResults(requestedProjectId, projectVersion, body) {
        calls.push({ operation: "extraction", requestedProjectId, projectVersion, body });
        return {
          results: [
            {
              documentId: fileId,
              beteiligungsEingangId: entryId,
              arguments: [
                {
                  argumentId,
                  extractedArgument: {
                    argument: { text: "Lärm", span: { startIdx: 0, endIdx: 4 } },
                    description: "Lärmbelastung",
                    context: { text: "Lärm und Staub", span: { startIdx: 0, endIdx: 14 } },
                  },
                },
              ],
              skipped: false,
            },
          ],
        };
      },
      async storeClassificationResults(requestedProjectId, projectVersion, body) {
        calls.push({ operation: "classification", requestedProjectId, projectVersion, body });
        return { updatedCount: 1 };
      },
      async markClassificationFailed(requestedProjectId, projectVersion, body) {
        calls.push({ operation: "failed", requestedProjectId, projectVersion, body });
        return { updatedCount: 1 };
      },
      async markInjectionDetected(requestedProjectId, projectVersion, body) {
        calls.push({ operation: "injection", requestedProjectId, projectVersion, body });
        return { updatedCount: 1 };
      },
    };
    const objections = createAosObjectionsService(resource);

    const results = await runWithProjectContext(
      { projectId, projectVersion: 7 },
      async () => ({
        processed: await objections.listProcessedFileIds(projectId),
        extraction: await objections.storeExtractionResults(projectId, {
          documentArguments: [],
        }),
        classification: await objections.storeClassificationResults(projectId, {
          classifiedArguments: [{ argumentId, topicId, subTopicId: null }],
          unclassifiedArgumentIds: [],
        }),
        failed: await objections.markClassificationFailed(projectId, {
          beteiligungsEingangIds: [entryId],
        }),
        injection: await objections.markInjectionDetected(projectId, {
          documents: [{ fileId, documentName: "einwendung.pdf", snippet: null }],
        }),
      }),
    );

    expect(results).toEqual({
      processed: [fileId],
      extraction: {
        results: [
          {
            documentId: fileId,
            beteiligungsEingangId: entryId,
            arguments: [
              {
                argumentId,
                extractedArgument: {
                  argument: { text: "Lärm", span: { startIdx: 0, endIdx: 4 } },
                  description: "Lärmbelastung",
                  context: { text: "Lärm und Staub", span: { startIdx: 0, endIdx: 14 } },
                },
              },
            ],
            skipped: false,
          },
        ],
      },
      classification: { updatedCount: 1 },
      failed: { updatedCount: 1 },
      injection: { updatedCount: 1 },
    });
    expect(calls.map(({ operation, requestedProjectId, projectVersion }) => ({
      operation,
      requestedProjectId,
      projectVersion,
    }))).toEqual([
      { operation: "list", requestedProjectId: projectId, projectVersion: 7 },
      { operation: "extraction", requestedProjectId: projectId, projectVersion: 7 },
      { operation: "classification", requestedProjectId: projectId, projectVersion: 7 },
      { operation: "failed", requestedProjectId: projectId, projectVersion: 7 },
      { operation: "injection", requestedProjectId: projectId, projectVersion: 7 },
    ]);
  });

  test("rejects missing and mismatched project context before touching the Resource", async () => {
    let calls = 0;
    const resource: ObjectionsService = {
      async listProcessedFileIds() {
        calls += 1;
        return [];
      },
      async storeExtractionResults() {
        calls += 1;
        return { results: [] };
      },
      async storeClassificationResults() {
        calls += 1;
        return { updatedCount: 0 };
      },
      async markClassificationFailed() {
        calls += 1;
        return { updatedCount: 0 };
      },
      async markInjectionDetected() {
        calls += 1;
        return { updatedCount: 0 };
      },
    };
    const objections = createAosObjectionsService(resource);

    expect(objections.listProcessedFileIds(projectId)).rejects.toBeInstanceOf(
      ObjectionsProjectContextError,
    );
    expect(
      runWithProjectContext({ projectId: otherProjectId, projectVersion: 7 }, () =>
        objections.storeClassificationResults(projectId, {
          classifiedArguments: [],
          unclassifiedArgumentIds: [],
        }),
      ),
    ).rejects.toMatchObject({
      name: "ObjectionsProjectContextError",
      message: `Objections project ${projectId} does not match context project ${otherProjectId}`,
    });
    expect(calls).toBe(0);
  });
});
