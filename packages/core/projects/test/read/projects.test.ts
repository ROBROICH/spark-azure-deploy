import { describe, expect } from "bun:test";

import {
  LatestVersionSchema,
  parseErrorContract,
  parseReadContract,
  ProjectSchema,
  ProjectsSchema,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

describe("Project Logic project reads", () => {
  externalTest("lists and filters the retained project", async () => {
    const [all, currentStatus, noMatch] = await Promise.all([
      readJson("/projects"),
      readJson("/projects?status=IN_PROGRESS"),
      readJson("/projects?name=does-not-exist"),
    ]);
    const allBody = parseReadContract(ProjectsSchema, all.body);
    const statusBody = parseReadContract(ProjectsSchema, currentStatus.body);
    const noMatchBody = parseReadContract(ProjectsSchema, noMatch.body);

    expect([all.status, currentStatus.status, noMatch.status]).toEqual([200, 200, 200]);
    expect(allBody).toHaveLength(1);
    expect(statusBody).toHaveLength(1);
    expect(noMatchBody).toEqual([]);
    expect(allBody[0]).toMatchObject({
      id: readScenarios.projects.populated.id,
      projectVersion: readScenarios.projects.populated.latestVersion,
      latestVersion: readScenarios.projects.populated.latestVersion,
      projectTypeId: readScenarios.projectTypes.primary,
      statusId: readScenarios.projectStatuses.current,
    });
  });

  externalTest("returns one project and rejects an unknown project", async () => {
    const [found, absent] = await Promise.all([
      readJson(`/projects/${readScenarios.projects.populated.id}`),
      readJson(`/projects/${readScenarios.projects.unknown.id}`),
    ]);
    const foundBody = parseReadContract(ProjectSchema, found.body);

    expect(found.status).toBe(200);
    expect(foundBody).toMatchObject({
      id: readScenarios.projects.populated.id,
      projectVersion: readScenarios.projects.populated.latestVersion,
      latestVersion: readScenarios.projects.populated.latestVersion,
      projectTypeId: readScenarios.projectTypes.primary,
      statusId: readScenarios.projectStatuses.current,
    });
    expect(absent.status).toBe(404);
    parseErrorContract(absent.body);
  });

  externalTest("returns the current version and rejects an unknown project", async () => {
    const [found, absent] = await Promise.all([
      readJson(`/projects/${readScenarios.projects.populated.id}/latest-version`),
      readJson(`/projects/${readScenarios.projects.unknown.id}/latest-version`),
    ]);

    expect(found.status).toBe(200);
    expect(parseReadContract(LatestVersionSchema, found.body)).toEqual({
      projectId: readScenarios.projects.populated.id,
      latestVersion: readScenarios.projects.populated.latestVersion,
    });
    expect(absent.status).toBe(404);
    parseErrorContract(absent.body);
  });
});
