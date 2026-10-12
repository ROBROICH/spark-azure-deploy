import type { AuthPolicy } from "@spark-workflow/authentification";
import { type FeatureHttp, useLogger } from "@spark-workflow/http-host";
import { Type } from "@sinclair/typebox";
import { defineAuditCatalog } from "evlog";

import { identityErrors } from "../errors";
import type { feature } from "../manifest.ts";
import type { ProjectRelations, RelationshipItem } from "../providers/spicedb";

const ProjectParams = Type.Object(
  { projectId: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);
const AssignmentRole = Type.Union([
  Type.Literal("owner"),
  Type.Literal("member"),
  Type.Literal("auditor"),
]);
const Relation = Type.Union([
  Type.Literal("owner"),
  Type.Literal("member"),
  Type.Literal("auditor"),
]);
const RelationshipWriteResponse = Type.Object(
  { success: Type.Literal(true) },
  { additionalProperties: false },
);
export const ProjectAssignmentsRequest = Type.Object(
  {
    assignments: Type.Array(
      Type.Object(
        {
          role: AssignmentRole,
          userId: Type.String({ minLength: 1, maxLength: 1_000 }),
        },
        { additionalProperties: false },
      ),
      { maxItems: 1_000 },
    ),
  },
  { additionalProperties: false },
);
const assignmentPolicy = {
  permissions: [{ resource: "project", permission: "assign", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;
const assignmentAudit = defineAuditCatalog("identity", {
  PROJECT_ASSIGNMENTS_REPLACE: {
    target: "project",
    severity: "high",
    requiresChanges: true,
  },
});
const keyFor = ({ relation, userId }: RelationshipItem) => `${relation}\0${userId}`;
const sorted = (items: Iterable<RelationshipItem>) =>
  [...items].sort((left, right) => keyFor(left).localeCompare(keyFor(right)));

export function createAssignmentRoutes(http: FeatureHttp<typeof feature>) {
  return http
    .controller("identity-management.routes.assignments")
    .model({ Relation, RelationshipWriteResponse })
    .post(
      "/assign/projects/:projectId/assignments",
      async ({ params, body, auth, identity }) => {
        if (!auth.user) throw identityErrors.AUTHENTICATION_REQUIRED();
        const requested = new Map(
          body.assignments.map(({ role, userId }) => {
            const item = { relation: role, userId: userId };
            return [keyFor(item), item];
          }),
        );
        if (![...requested.values()].some(({ relation }) => relation === "owner")) {
          throw identityErrors.PROJECT_OWNER_REQUIRED();
        }

        const relations = await identity.assignments.listProjectRelations(params.projectId);
        if (relations.isErr()) throw relations.error;
        const currentRelations = relations.value;
        const current = new Map<string, RelationshipItem>();
        for (const relation of ["owner", "member"] satisfies (keyof ProjectRelations)[]) {
          for (const userId of currentRelations[relation]) {
            const item = { relation, userId };
            current.set(keyFor(item), item);
          }
        }
        const removed = sorted(
          [...current].flatMap(([key, item]) => (requested.has(key) ? [] : [item])),
        );
        const addedCount = [...requested.keys()].filter((key) => !current.has(key)).length;
        const updated = await identity.assignments.updateProjectRelations(
          params.projectId,
          sorted(requested.values()),
          removed,
        );
        if (updated.isErr()) throw updated.error;
        useLogger().audit?.(
          assignmentAudit.PROJECT_ASSIGNMENTS_REPLACE({
            actor: { type: "user", id: auth.user.sub },
            target: { id: params.projectId },
            changes: {
              after: {
                requestedCount: requested.size,
                addedCount,
                deletedCount: removed.length,
              },
            },
          }),
        );
        return { success: true };
      },
      {
        params: ProjectParams,
        body: ProjectAssignmentsRequest,
        response: RelationshipWriteResponse,
        auth: assignmentPolicy,
        identity: true,
        detail: { operationId: "replaceProjectAssignments" },
      },
    );
}
