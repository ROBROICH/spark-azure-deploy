import { describe, expect, mock, test } from "bun:test";
import {
  nodeColumn,
  nodePayload,
  type NodeDefinition,
  type ProjectVersionPeer,
} from "@spark-workflow/node-crud";

import { deadlines, subtopics, topicNorms, topics } from "../src/db/schema.ts";
import { createProjectLogicNodeDescriptor } from "../src/node/descriptor.ts";
import { ProjectVersions } from "../src/project-versions.ts";

const projectLogicNodes = createProjectLogicNodeDescriptor().nodes;

const byType = new Map(projectLogicNodes.map((node) => [node.nodeType, node]));
const node = (nodeType: string): NodeDefinition => {
  const definition = byType.get(nodeType);
  if (definition === undefined) throw new Error(`Missing ${nodeType} definition`);
  return definition;
};

const common = {
  id: "30000000-0000-4000-8000-000000000001",
  projectId: "10000000-0000-4000-8000-000000000001",
  projectVersion: 2,
  createdAt: "2026-01-02T10:00:00Z",
  updatedAt: "2026-01-03T10:00:00Z",
  isDeleted: false,
  frontendParentIds: [],
  updateType: "manual",
  isOutdated: false,
} as const;

describe("Project Logic canonical node descriptor", () => {
  test("binds the supported node behavior to the app's tables", () => {
    expect(node("deadline").table).toBe(deadlines);
    expect(node("subtopic").table).toBe(subtopics);
    expect(node("topic").table).toBe(topics);
    expect(node("topic_norm").table).toBe(topicNorms);

    expect(nodeColumn(node("topic"), "project_id")).toBe(topics.projectId);
    expect(nodeColumn(node("topic"), "project_version")).toBe(topics.projectVersion);
    expect(nodeColumn(node("topic"), "parent_topic_id")).toBe(topics.parentTopicId);
    expect(nodeColumn(node("topic_norm"), "satz_statuses")).toBe(topicNorms.satzStatuses);
  });

  test("declares persisted parents without treating the excluded project root as a node", () => {
    expect(node("deadline").parents).toEqual([]);
    expect(node("topic").parents).toContainEqual({
      kind: "persisted",
      field: "parentTopicId",
      nodeType: "topic",
    });
    expect(node("subtopic").parents).toContainEqual({
      kind: "persisted",
      field: "topicId",
      nodeType: "topic",
    });
    expect(node("topic_norm").parents).toContainEqual({
      kind: "persisted",
      field: "topicId",
      nodeType: "topic",
    });
    expect(projectLogicNodes.some(({ nodeType }) => nodeType === "project")).toBeFalse();
  });

  test("projects camel-key Drizzle rows through physical-name bindings", () => {
    expect(
      nodePayload(node("topic"), {
        id: common.id,
        projectId: common.projectId,
        projectVersion: common.projectVersion,
        createdAt: new Date(common.createdAt),
        updatedAt: new Date(common.updatedAt),
        sysPeriod: '["2026-01-02 10:00:00+00",)',
        isDeleted: common.isDeleted,
        frontendParentIds: ["project:10000000-0000-4000-8000-000000000001"],
        updateType: "AUTOMATED",
        isOutdated: common.isOutdated,
        name: "A root topic",
        description: null,
        parentTopicId: null,
        mvpAssignee: null,
        rpbAssignee: null,
        mvpAssignees: [],
        rpbAssignees: [],
        showInMvp: true,
        showInEwm: false,
        showInBeschluss: true,
      }),
    ).toEqual({
      nodeType: "topic",
      ...common,
      createdAt: "2026-01-02T10:00:00Z",
      updatedAt: "2026-01-03T10:00:00Z",
      frontendParentIds: ["project:10000000-0000-4000-8000-000000000001"],
      updateType: "automated",
      name: "A root topic",
      description: null,
      parentTopicId: null,
      mvpAssignee: null,
      rpbAssignee: null,
      mvpAssignees: [],
      rpbAssignees: [],
      showInMvp: true,
      showInEwm: false,
      showInBeschluss: true,
    });
  });

  test("uses the existing ProjectVersions authority as the canonical version peer", async () => {
    const peer = Object.create(ProjectVersions.prototype) as ProjectVersions;
    const latestOne = mock(async () => 3);
    const validateLock = mock(async () => undefined);
    peer.latestOne = latestOne;
    peer.validateLock = validateLock;
    const satisfiesPeer = (value: ProjectVersionPeer) => value;

    expect((await satisfiesPeer(peer).resolveLatestVersion(common.projectId)).unwrap()).toBe(3);
    expect(latestOne).toHaveBeenCalledWith(common.projectId);
    expect(
      (
        await peer.validateVersionLock({
          projectId: common.projectId,
          sourceVersion: 3,
          targetVersion: 4,
          lockToken: "project-logic-lock",
        })
      ).isOk(),
    ).toBeTrue();
    expect(validateLock).toHaveBeenCalledWith({
      projectId: common.projectId,
      sourceVersion: 3,
      targetVersion: 4,
      lockToken: "project-logic-lock",
    });
  });

  test("rejects response fields that are not part of the table-backed contract", () => {
    expect(node("deadline").schemas.response.additionalProperties).toBeFalse();
  });
});
