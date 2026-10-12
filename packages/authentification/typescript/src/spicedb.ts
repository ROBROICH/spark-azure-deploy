import { v1 } from "@authzed/authzed-node";
import { Result } from "better-result";
import { readFileSync } from "node:fs";
import { Redacted } from "effect";

import type { Permission, Relation, Resource } from "./enums";
import { authenticationErrors } from "./errors";

export type SpiceDbConfig = {
  endpoint: string;
  token: Redacted.Redacted<string>;
  certPath?: string;
  insecure?: boolean;
};

export type PermissionCheck = {
  resource: Resource;
  resourceId: string;
  permission: Permission;
  subjectId: string;
};

export type Relationship = {
  resourceType: Resource;
  resourceId: string;
  relation: Relation;
  subjectId: string;
};

export type ListResourceRelationsInput = {
  resourceType: Resource;
  resourceIds: readonly string[];
  relations: readonly Relation[];
};

export type BulkRelationsResult = Record<string, Partial<Record<Relation, string[]>>>;

const emptyRelations: BulkRelationsResult = {};

export function connectSpiceDb(config: SpiceDbConfig) {
  try {
    if (!config.insecure && config.certPath) {
      return Result.ok(
        v1.NewClientWithCustomCert(Redacted.value(config.token), config.endpoint, readFileSync(config.certPath)),
      );
    }
    return Result.ok(
      v1.NewClient(
        Redacted.value(config.token),
        config.endpoint,
        config.insecure
          ? v1.ClientSecurity.INSECURE_PLAINTEXT_CREDENTIALS
          : v1.ClientSecurity.SECURE,
      ),
    );
  } catch (cause) {
    return Result.err(
      authenticationErrors.PROVIDER_UNAVAILABLE({
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }
}

const consistency = () =>
  v1.Consistency.create({
    requirement: { oneofKind: "fullyConsistent", fullyConsistent: true },
  });

const subject = (subjectId: string) =>
  v1.SubjectReference.create({
    object: v1.ObjectReference.create({ objectType: "user", objectId: subjectId }),
  });

export async function checkPermission(client: v1.ZedClientInterface, check: PermissionCheck) {
  try {
    const response = await client.promises.checkPermission(
      v1.CheckPermissionRequest.create({
        consistency: consistency(),
        resource: v1.ObjectReference.create({
          objectType: check.resource,
          objectId: check.resourceId,
        }),
        permission: check.permission,
        subject: subject(check.subjectId),
      }),
    );
    return Result.ok(
      response.permissionship === v1.CheckPermissionResponse_Permissionship.HAS_PERMISSION,
    );
  } catch (cause) {
    return Result.err(
      authenticationErrors.PROVIDER_UNAVAILABLE({
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }
}

export async function listAccessibleResources(
  client: v1.ZedClientInterface,
  check: Omit<PermissionCheck, "resourceId">,
) {
  try {
    const responses = await client.promises.lookupResources(
      v1.LookupResourcesRequest.create({
        consistency: consistency(),
        resourceObjectType: check.resource,
        permission: check.permission,
        subject: subject(check.subjectId),
      }),
    );
    return Result.ok(responses.map((response) => response.resourceObjectId));
  } catch (cause) {
    return Result.err(
      authenticationErrors.PROVIDER_UNAVAILABLE({
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }
}

export async function listAssignedProjectIds(client: v1.ZedClientInterface, subjectId: string) {
  try {
    const projectIds = new Set<string>();
    for (const relation of ["owner", "member"]) {
      const rows = await client.promises.readRelationships(v1.ReadRelationshipsRequest.create({
        consistency: consistency(),
        relationshipFilter: v1.RelationshipFilter.create({
          resourceType: "project",
          optionalRelation: relation,
          optionalSubjectFilter: v1.SubjectFilter.create({
            subjectType: "user",
            optionalSubjectId: subjectId,
          }),
        }),
      }));
      for (const row of rows) {
        const projectId = row.relationship?.resource?.objectId;
        if (projectId) projectIds.add(projectId);
      }
    }
    return Result.ok([...projectIds]);
  } catch (cause) {
    return Result.err(authenticationErrors.PROVIDER_UNAVAILABLE({
      cause: cause instanceof Error ? cause : undefined,
    }));
  }
}

async function writeRelationship(
  client: v1.ZedClientInterface,
  relationship: Relationship,
  operation: v1.RelationshipUpdate_Operation,
) {
  try {
    await client.promises.writeRelationships(
      v1.WriteRelationshipsRequest.create({
        updates: [
          v1.RelationshipUpdate.create({
            operation,
            relationship: v1.Relationship.create({
              resource: v1.ObjectReference.create({
                objectType: relationship.resourceType,
                objectId: relationship.resourceId,
              }),
              relation: relationship.relation,
              subject: v1.SubjectReference.create({
                object: v1.ObjectReference.create({
                  objectType: "user",
                  objectId: relationship.subjectId,
                }),
                optionalRelation: "",
              }),
            }),
          }),
        ],
      }),
    );
    return Result.ok(undefined);
  } catch (cause) {
    return Result.err(
      authenticationErrors.PROVIDER_UNAVAILABLE({
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }
}

export function touchRelationship(client: v1.ZedClientInterface, relationship: Relationship) {
  return writeRelationship(client, relationship, v1.RelationshipUpdate_Operation.TOUCH);
}

export function deleteRelationship(client: v1.ZedClientInterface, relationship: Relationship) {
  return writeRelationship(client, relationship, v1.RelationshipUpdate_Operation.DELETE);
}

export async function listResourceRelationsBulk(
  client: v1.ZedClientInterface,
  input: ListResourceRelationsInput,
) {
  if (input.resourceIds.length === 0 || input.relations.length === 0) {
    return Result.ok(emptyRelations);
  }

  const resourceIds = [...new Set(input.resourceIds)];
  const relations = [...new Set(input.relations)];
  const collected = new Map(
    resourceIds.map((resourceId) => [
      resourceId,
      new Map(relations.map((relation) => [relation, new Set<string>()])),
    ]),
  );
  const requestedRelations = new Set<Relation>(relations);

  try {
    for (const resourceId of resourceIds) {
      const responses = await client.promises.readRelationships(
        v1.ReadRelationshipsRequest.create({
          consistency: consistency(),
          relationshipFilter: v1.RelationshipFilter.create({
            resourceType: input.resourceType,
            optionalResourceId: resourceId,
          }),
        }),
      );

      for (const response of responses) {
        const relationship = response.relationship;
        const resourceId = relationship?.resource?.objectId;
        const returnedRelation = relationship?.relation as Relation | undefined;
        const returnedSubject = relationship?.subject?.object;
        if (!resourceId || !returnedRelation || !returnedSubject) continue;
        if (!requestedRelations.has(returnedRelation) || returnedSubject.objectType !== "user") {
          continue;
        }
        collected.get(resourceId)?.get(returnedRelation)?.add(returnedSubject.objectId);
      }
    }

    return Result.ok(
      Object.fromEntries(
        [...collected].map(([resourceId, relationMap]) => [
          resourceId,
          Object.fromEntries(
            [...relationMap].map(([relation, subjectIds]) => [relation, [...subjectIds].sort()]),
          ),
        ]),
      ),
    );
  } catch (cause) {
    return Result.err(
      authenticationErrors.PROVIDER_UNAVAILABLE({
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }
}
