import { describe, expect, mock, test } from "bun:test";
import { v1 } from "@authzed/authzed-node";

import {
  checkPermission,
  deleteRelationship,
  listAccessibleResources,
  listResourceRelationsBulk,
  touchRelationship,
} from "../src/spicedb";

const relationship = {
  resourceType: "project" as const,
  resourceId: "project-1",
  relation: "owner" as const,
  subjectId: "user-1",
};

const relationshipResponse = (resourceId: string, relation: string, subjectId: string) =>
  v1.ReadRelationshipsResponse.create({
    relationship: v1.Relationship.create({
      resource: v1.ObjectReference.create({ objectType: "project", objectId: resourceId }),
      relation,
      subject: v1.SubjectReference.create({
        object: v1.ObjectReference.create({ objectType: "user", objectId: subjectId }),
      }),
    }),
  });

function fakeClient() {
  const writeRelationships = mock(async (_request: v1.WriteRelationshipsRequest) =>
    v1.WriteRelationshipsResponse.create(),
  );
  const readRelationships = mock(
    async (_request: v1.ReadRelationshipsRequest): Promise<v1.ReadRelationshipsResponse[]> => [],
  );
  const check = mock(async () =>
    v1.CheckPermissionResponse.create({
      permissionship: v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION,
    }),
  );
  const lookupResources = mock(async () => [
    v1.LookupResourcesResponse.create({ resourceObjectId: "project-1" }),
    v1.LookupResourcesResponse.create({ resourceObjectId: "project-2" }),
  ]);
  const client = Object.create(null) as v1.ZedClientInterface;
  Object.defineProperty(client, "promises", {
    value: { checkPermission: check, lookupResources, readRelationships, writeRelationships },
  });
  return { check, client, lookupResources, readRelationships, writeRelationships };
}

describe("SpiceDB operations", () => {
  test("encodes touch and delete directly", async () => {
    const { client, writeRelationships } = fakeClient();
    expect((await touchRelationship(client, relationship)).isOk()).toBeTrue();
    expect((await deleteRelationship(client, relationship)).isOk()).toBeTrue();

    const updates = writeRelationships.mock.calls.map(([request]) => request.updates[0]);
    expect(updates.map((update) => update?.operation)).toEqual([
      v1.RelationshipUpdate_Operation.TOUCH,
      v1.RelationshipUpdate_Operation.DELETE,
    ]);
    expect(updates[0]?.relationship).toMatchObject({
      resource: { objectType: "project", objectId: "project-1" },
      relation: "owner",
      subject: { object: { objectType: "user", objectId: "user-1" } },
    });
  });

  test("bulk reads preinitialize, filter, deduplicate, and sort", async () => {
    const { client, readRelationships } = fakeClient();
    readRelationships.mockResolvedValue([
      relationshipResponse("project-1", "owner", "user-2"),
      relationshipResponse("project-1", "owner", "user-1"),
      relationshipResponse("project-1", "owner", "user-1"),
      relationshipResponse("project-unrequested", "owner", "ignored"),
      relationshipResponse("project-1", "member", "user-3"),
      relationshipResponse("project-2", "member", "user-4"),
    ]);

    expect(
      (
        await listResourceRelationsBulk(client, {
          resourceType: "project",
          resourceIds: ["project-2", "project-1", "project-empty", "project-1"],
          relations: ["member", "owner", "member"],
        })
      ).unwrap(),
    ).toEqual({
      "project-2": { member: ["user-4"], owner: [] },
      "project-1": { member: ["user-3"], owner: ["user-1", "user-2"] },
      "project-empty": { member: [], owner: [] },
    });
  });

  test("does no work for empty bulk inputs", async () => {
    const { client, readRelationships } = fakeClient();
    expect(
      (
        await listResourceRelationsBulk(client, {
          resourceType: "project",
          resourceIds: [],
          relations: ["owner"],
        })
      ).unwrap(),
    ).toEqual({});
    expect(readRelationships).not.toHaveBeenCalled();
  });

  test("checks permissions and lists accessible resources", async () => {
    const { check, client, lookupResources } = fakeClient();
    expect(
      (
        await checkPermission(client, {
          resource: "project",
          resourceId: "project-1",
          permission: "read",
          subjectId: "user-1",
        })
      ).unwrap(),
    ).toBe(true);
    expect(
      (
        await listAccessibleResources(client, {
          resource: "project",
          permission: "read",
          subjectId: "user-1",
        })
      ).unwrap(),
    ).toEqual(["project-1", "project-2"]);
    expect(check).toHaveBeenCalledTimes(1);
    expect(lookupResources).toHaveBeenCalledTimes(1);
  });
});
