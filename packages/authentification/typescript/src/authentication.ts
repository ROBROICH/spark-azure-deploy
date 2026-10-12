import type { v1 } from "@authzed/authzed-node";
import { adoptForwardedAuditContext, setAuditActor } from "@spark-workflow/audit-client";
import { Result } from "better-result";
import { Elysia, status } from "elysia";
import { EvlogError } from "evlog";

import { parseAuthConfig } from "./config";
import type { OidcRole, Permission, Resource } from "./enums";
import { authenticationErrors } from "./errors";
import { machineUser } from "./identity";
import { machineIdentityFromXfcc } from "./machine-identity";
import { verifyToken } from "./oidc";
import {
  checkPermission,
  connectSpiceDb,
  deleteRelationship as deleteSpiceDbRelationship,
  listAccessibleResources,
  listAssignedProjectIds,
  listResourceRelationsBulk,
  touchRelationship as touchSpiceDbRelationship,
  type ListResourceRelationsInput,
  type Relationship,
} from "./spicedb";

export type PermissionDeclaration =
  | { readonly resource: Resource; readonly permission: Permission; readonly path: string }
  | { readonly resource: Resource; readonly permission: Permission; readonly query: string }
  | { readonly resource: Resource; readonly permission: Permission; readonly body: string };

export type AuthPolicy = {
  readonly machine?: boolean;
  readonly roles?: readonly OidcRole[];
  readonly permissions?: readonly PermissionDeclaration[];
  readonly bypassRoles?: readonly OidcRole[];
};

type PermissionCheck = Readonly<{
  resource: Resource;
  resourceId: string;
  permission: Permission;
}>;

type PermissionEntitySources = Readonly<{
  params: Record<string, string>;
  query: Record<string, string>;
  body: object;
}>;

let activeRuntime:
  | Readonly<{ mode: "disabled" }>
  | Readonly<{
      mode: "strict";
      baseUrl: string;
      realm: string;
      audience: string;
      jwksUrl?: string;
      algorithms: readonly string[];
      spiceDb?: v1.ZedClientInterface;
      allowedMachineIdentities: string;
    }>
  | EvlogError
  | undefined;

function runtime() {
  if (activeRuntime !== undefined) return activeRuntime;

  const configured = parseAuthConfig();
  if (configured.isErr()) {
    activeRuntime = configured.error;
    return activeRuntime;
  }
  if (configured.value.mode === "disabled") {
    activeRuntime = configured.value;
    return activeRuntime;
  }

  const spiceDb = configured.value.spiceDb
    ? connectSpiceDb(configured.value.spiceDb)
    : Result.ok(undefined);
  if (spiceDb.isErr()) {
    activeRuntime = spiceDb.error;
    return activeRuntime;
  }

  activeRuntime = {
    mode: "strict",
    baseUrl: configured.value.baseUrl,
    realm: configured.value.realm,
    audience: configured.value.audience,
    jwksUrl: configured.value.jwksUrl,
    algorithms: configured.value.algorithms,
    spiceDb: spiceDb.value,
    allowedMachineIdentities: configured.value.allowedMachineIdentities,
  };
  return activeRuntime;
}

async function identityFromRequest(
  request: Request,
  current: Exclude<NonNullable<typeof activeRuntime>, EvlogError | { mode: "disabled" }>,
) {
  const authorization = request.headers.get("authorization");
  const token = authorization
    ? /^Bearer\s+(.+)$/i.exec(authorization.trim())?.[1]?.trim()
    : undefined;
  if (token) return verifyToken(token, current);

  const machine = machineIdentityFromXfcc(
    request.headers.get("x-forwarded-client-cert") ?? undefined,
    current.allowedMachineIdentities,
  );
  if (!machine) return Result.err(authenticationErrors.MISSING_CREDENTIAL());
  if (!machine.allowed) return Result.err(authenticationErrors.MACHINE_IDENTITY_NOT_ALLOWED());
  adoptForwardedAuditContext(request.headers);
  return Result.ok(machineUser(machine.namespace, machine.serviceAccount));
}

async function checkPermissions(
  client: v1.ZedClientInterface | undefined,
  userId: string,
  checks: readonly PermissionCheck[],
) {
  if (checks.length === 0) return Result.ok(undefined);
  if (!client) return Result.err(authenticationErrors.SPICEDB_NOT_CONFIGURED());

  for (const check of checks) {
    const permission = await checkPermission(client, { ...check, subjectId: userId });
    if (permission.isErr()) return permission;
    if (!permission.value) return Result.err(authenticationErrors.ACCESS_DENIED());
  }
  return Result.ok(undefined);
}

function normalizedEntity(declaration: PermissionDeclaration, sources: PermissionEntitySources) {
  const [source, key] =
    "path" in declaration
      ? [sources.params, declaration.path]
      : "query" in declaration
        ? [sources.query, declaration.query]
        : [sources.body, declaration.body];
  const value = Reflect.get(source, key);
  if (value === undefined || value === null) {
    return Result.err(authenticationErrors.INVALID_RESOURCE_ID());
  }
  const normalized = `${value}`.trim();
  return normalized
    ? Result.ok(normalized)
    : Result.err(authenticationErrors.INVALID_RESOURCE_ID());
}

export const authentication = new Elysia({ name: "bmds.authentification" })
  .resolve({ as: "scoped" }, async ({ request, set }) => {
    const current = runtime();
    if (EvlogError.isEvlogError(current))
      return status(current.status, { detail: current.message });
    if (current.mode === "disabled") {
      setAuditActor(undefined);
      return {
        auth: {
          user: null,
          readsEveryProject: true,
          accessibleResourceIds: async () => Result.ok(undefined),
          assignedProjectIds: async () => Result.ok(undefined),
          authorize: async () => Result.ok(undefined),
          readProject: async () => Result.ok(undefined),
          readableProjectIds: async () => Result.ok(undefined),
          listableProjectIds: async () => Result.ok(undefined),
        },
      };
    }

    const identity = await identityFromRequest(request, current);
    if (identity.isErr()) {
      set.headers["WWW-Authenticate"] = "Bearer";
      return status(identity.error.status, { detail: identity.error.message });
    }

    const user = identity.value;
    setAuditActor(user.sub);
    const readsEveryProject = user.realmRoles.some(
      (role) => role === "admin" || role === "service",
    );
    const accessibleResourceIds = async (resource: Resource, permission: Permission) => {
      if (!current.spiceDb) {
        return Result.err(authenticationErrors.SPICEDB_NOT_CONFIGURED());
      }
      return listAccessibleResources(current.spiceDb, {
        resource,
        permission,
        subjectId: user.sub,
      });
    };
    return {
      auth: {
        user,
        readsEveryProject,
        accessibleResourceIds,
        assignedProjectIds: async () => {
          if (!current.spiceDb) {
            return Result.err(authenticationErrors.SPICEDB_NOT_CONFIGURED());
          }
          return listAssignedProjectIds(current.spiceDb, user.sub);
        },
        authorize: async (
          checks: readonly PermissionCheck[],
          options: Readonly<{ bypassRoles?: readonly OidcRole[] }> = {},
        ) =>
          options.bypassRoles?.some((role) => user.realmRoles.includes(role))
            ? Result.ok(undefined)
            : checkPermissions(current.spiceDb, user.sub, checks),
        readProject: async (projectId: string | null) =>
          readsEveryProject
            ? Result.ok(undefined)
            : projectId === null
              ? Result.err(authenticationErrors.ACCESS_DENIED())
              : checkPermissions(current.spiceDb, user.sub, [
                  { resource: "project", resourceId: projectId, permission: "read" },
                ]),
        readableProjectIds: async () =>
          readsEveryProject ? Result.ok(undefined) : accessibleResourceIds("project", "read"),
        listableProjectIds: async () =>
          user.realmRoles.includes("admin")
            ? Result.ok(undefined)
            : accessibleResourceIds("project", "read"),
      },
    };
  })
  .onBeforeHandle({ as: "scoped" }, async ({ auth, params }) => {
    // Elysia leaves params undefined on routes without path parameters.
    if (!params?.projectId) return;
    const authorization = await auth.readProject(params.projectId);
    if (authorization.isErr()) {
      return status(authorization.error.status, { detail: authorization.error.message });
    }
  })
  .macro({
    auth: (policy: AuthPolicy) => ({
      async beforeHandle({ auth, params, query, body }) {
        if (!auth) {
          const error = authenticationErrors.MISSING_CREDENTIAL();
          return status(error.status, { detail: error.message });
        }
        if (!auth.user) return;
        if (policy.machine && auth.user.kind !== "machine") {
          const error = authenticationErrors.ACCESS_DENIED();
          return status(error.status, { detail: error.message });
        }
        if (
          policy.roles?.length &&
          !policy.roles.some((role) => auth.user.realmRoles.includes(role))
        ) {
          const error = authenticationErrors.ACCESS_DENIED();
          return status(error.status, { detail: error.message });
        }
        if (policy.bypassRoles?.some((role) => auth.user.realmRoles.includes(role))) return;

        const checks: PermissionCheck[] = [];
        for (const declaration of policy.permissions ?? []) {
          const entity = normalizedEntity(declaration, { params, query, body: Object(body) });
          if (entity.isErr()) return status(entity.error.status, { detail: entity.error.message });
          checks.push({
            resource: declaration.resource,
            resourceId: entity.value,
            permission: declaration.permission,
          });
        }
        const authorization = await auth.authorize(checks);
        if (authorization.isErr()) {
          return status(authorization.error.status, { detail: authorization.error.message });
        }
      },
    }),
  });

export async function listProjectRelations(input: ListResourceRelationsInput) {
  const current = runtime();
  if (EvlogError.isEvlogError(current)) return Result.err(current);
  if (current.mode === "disabled") return Result.ok({});
  if (!current.spiceDb) return Result.err(authenticationErrors.SPICEDB_NOT_CONFIGURED());
  return listResourceRelationsBulk(current.spiceDb, input);
}

export async function touchRelationship(relationship: Relationship) {
  const current = runtime();
  if (EvlogError.isEvlogError(current)) return Result.err(current);
  if (current.mode === "disabled") return Result.ok(undefined);
  if (!current.spiceDb) return Result.err(authenticationErrors.SPICEDB_NOT_CONFIGURED());
  return touchSpiceDbRelationship(current.spiceDb, relationship);
}

export async function deleteRelationship(relationship: Relationship) {
  const current = runtime();
  if (EvlogError.isEvlogError(current)) return Result.err(current);
  if (current.mode === "disabled") return Result.ok(undefined);
  if (!current.spiceDb) return Result.err(authenticationErrors.SPICEDB_NOT_CONFIGURED());
  return deleteSpiceDbRelationship(current.spiceDb, relationship);
}
