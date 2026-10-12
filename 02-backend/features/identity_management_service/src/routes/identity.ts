import type { AuthPolicy } from "@spark-workflow/authentification";
import { type FeatureHttp, useLogger } from "@spark-workflow/http-host";
import { Type } from "@sinclair/typebox";
import { t } from "elysia";
import { defineAuditCatalog } from "evlog";

import { identityErrors } from "../errors";
import type { feature } from "../manifest.ts";

const identityPolicy = { roles: ["admin", "user", "service"] } satisfies AuthPolicy;
const UsersQuery = Type.Object(
  { search: Type.Optional(Type.String()) },
  { additionalProperties: false },
);
const OidcRole = t.Union([t.Literal("admin"), t.Literal("user"), t.Literal("service")]);
const UserOidcRole = t.Union([t.Literal("admin"), t.Literal("user")]);
const IdentityResponse = t.Object(
  {
    userId: t.String(),
    email: t.String(),
    firstName: t.Nullable(t.String()),
    lastName: t.Nullable(t.String()),
    role: t.Nullable(OidcRole),
  },
  { additionalProperties: false },
);
const IdentitiesResponse = Type.Object(
  { users: Type.Array(IdentityResponse) },
  { additionalProperties: false },
);
const UpdateRolesRequest = Type.Object(
  { roles: Type.Array(UserOidcRole, { minItems: 1 }) },
  { additionalProperties: false },
);
const UpdateRolesResponse = Type.Object(
  { success: Type.Literal(true), roles: Type.Array(UserOidcRole) },
  { additionalProperties: false },
);
const roleAudit = defineAuditCatalog("identity", {
  USER_ROLES_REPLACE: {
    target: "user",
    severity: "high",
    requiresChanges: true,
  },
});

export function createIdentityRoutes(http: FeatureHttp<typeof feature>) {
  const routes = http
    .controller("identity-management.routes.identity")
    .model({
      IdentityResponse,
      OidcRole,
      UserOidcRole,
      IdentitiesResponse,
    })
    .get(
      "/me",
      ({ auth }) => {
        const user = auth.user;
        if (!user) throw identityErrors.AUTHENTICATION_REQUIRED();
        if (!user.email) throw identityErrors.EMAIL_REQUIRED();
        return {
          userId: user.sub,
          email: user.email,
          firstName: user.givenName ?? null,
          lastName: user.familyName ?? null,
          role: user.role ?? null,
        };
      },
      {
        response: IdentityResponse,
        auth: identityPolicy,
        detail: { operationId: "getCurrentIdentity" },
      },
    )
    .get(
      "/users",
      async ({ query, identity }) => {
        const result =
          query.search === undefined
            ? await identity.users.listAllUsers()
            : await identity.users.listUsers(query.search);
        if (result.isErr()) throw result.error;
        return {
          users: result.value.flatMap((user) => {
            if (
              !user.enabled ||
              !user.email ||
              !user.username ||
              user.username.startsWith("service-account-") ||
              user.username === "admin"
            ) {
              return [];
            }
            return [
              {
                userId: user.userId,
                email: user.email,
                firstName: user.firstName ?? null,
                lastName: user.lastName ?? null,
                role: user.role === "admin" ? "user" : (user.role ?? null),
              },
            ];
          }),
        };
      },
      {
        query: UsersQuery,
        response: IdentitiesResponse,
        auth: identityPolicy,
        identity: true,
        detail: { operationId: "listIdentities" },
      },
    );

  return routes.post(
    "/me/roles",
    async ({ auth, body, identity }) => {
      const user = auth.user;
      if (!user) throw identityErrors.AUTHENTICATION_REQUIRED();
      if (identity.roles === undefined) throw identityErrors.ROLE_SWITCH_DISABLED();
      if (user.kind !== "human") throw identityErrors.ROLE_SWITCH_FORBIDDEN();
      const result = await identity.roles.replaceManagedRoles(user.sub, body.roles);
      if (result.isErr()) throw result.error;
      useLogger().audit?.(
        roleAudit.USER_ROLES_REPLACE({
          actor: { type: "user", id: user.sub },
          target: { id: user.sub },
          changes: { after: { roles: body.roles } },
        }),
      );
      return { success: true, roles: body.roles };
    },
    {
      body: UpdateRolesRequest,
      response: UpdateRolesResponse,
      auth: identityPolicy,
      identity: true,
      detail: { operationId: "replaceCurrentUserRoles" },
    },
  );
}
