import {describe, expect} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";

import {LatestVersionSchema, parseErrorContract, parseReadContract, } from "../support/read-contracts.ts";
import {externalTest, readJson} from "../support/external-app.ts";
import {readScenarios} from "../support/read-scenarios.ts";

const validateLock = (projectId: string, body: HttpJson) =>
  readJson(`/projects/${projectId}/version-lock/validate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const validateWrite = (projectId: string, projectVersion: number) =>
  readJson(`/projects/${projectId}/version-lock/validate-write`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectVersion: projectVersion }),
  });

describe("Project Logic version-lock reads", () => {
  externalTest("rejects released, mismatched, unknown, and malformed locks", async () => {
    const lock = readScenarios.releasedVersionLock;
    const body = {
      sourceVersion: lock.sourceVersion,
      targetVersion: lock.targetVersion,
      lockToken: lock.token,
    };
    const [released, mismatched, unknown, malformed] = await Promise.all([
      validateLock(readScenarios.projects.populated.id, body),
      validateLock(readScenarios.projects.populated.id, { ...body, lockToken: "wrong-token" }),
      validateLock(readScenarios.projects.unknown.id, body),
      validateLock(readScenarios.projects.populated.id, {
        sourceVersion: 0,
        targetVersion: "one",
        lockToken: "",
      }),
    ]);

    expect([released.status, mismatched.status, unknown.status, malformed.status]).toEqual([
      409, 409, 404, 422,
    ]);
    for (const response of [released, mismatched, unknown, malformed]) {
      parseErrorContract(response.body);
    }
  });

  externalTest("validates current writes and rejects future or unknown projects", async () => {
    const [current, future, unknown, malformed] = await Promise.all([
      validateWrite(
        readScenarios.projects.populated.id,
        readScenarios.projects.populated.latestVersion!,
      ),
      validateWrite(readScenarios.projects.populated.id, 2),
      validateWrite(readScenarios.projects.unknown.id, 1),
      validateWrite(readScenarios.projects.populated.id, 0),
    ]);

    expect(current.status).toBe(200);
    expect(parseReadContract(LatestVersionSchema, current.body)).toEqual({
      projectId: readScenarios.projects.populated.id,
      latestVersion: readScenarios.projects.populated.latestVersion,
    });
    expect([future.status, unknown.status, malformed.status]).toEqual([409, 404, 422]);
    parseErrorContract(future.body);
    parseErrorContract(unknown.body);
    parseErrorContract(malformed.body);
  });
});
