import { Redacted } from "effect";
import { Result } from "better-result";
import { type Static, type TSchema, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { identityErrors } from "../errors";

export type ManagedRole = "admin" | "user";

const KeycloakAccessTokenSchema = Type.Object(
  { access_token: Type.String({ minLength: 1 }) },
  { additionalProperties: true },
);
const KeycloakAdminUserSchema = Type.Object(
  {
    id: Type.Optional(Type.String()),
    username: Type.Optional(Type.String()),
    enabled: Type.Optional(Type.Boolean()),
    email: Type.Optional(Type.String()),
    firstName: Type.Optional(Type.String()),
    lastName: Type.Optional(Type.String()),
  },
  { additionalProperties: true },
);
type KeycloakAdminUser = Static<typeof KeycloakAdminUserSchema>;
const KeycloakAdminUsersSchema = Type.Array(KeycloakAdminUserSchema);

export interface IdentityProviderUser {
  userId: string;
  username: string;
  enabled: boolean;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  role: ManagedRole | null;
}

export type KeycloakFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

const KeycloakRoleSchema = Type.Object(
  {
    id: Type.Optional(Type.String()),
    name: Type.Optional(Type.String()),
    description: Type.Optional(Type.String()),
    composite: Type.Optional(Type.Boolean()),
    clientRole: Type.Optional(Type.Boolean()),
    containerId: Type.Optional(Type.String()),
    attributes: Type.Optional(Type.Record(Type.String(), Type.Array(Type.String()))),
  },
  { additionalProperties: true },
);
type KeycloakRole = Static<typeof KeycloakRoleSchema>;
const KeycloakRolesSchema = Type.Array(KeycloakRoleSchema);
const KeycloakRoleUsersSchema = Type.Array(
  Type.Object({ id: Type.Optional(Type.String()) }, { additionalProperties: true }),
);

interface KeycloakAdminClientOptions {
  baseUrl: string;
  realm: string;
  clientId: string;
  clientSecret: Redacted.Redacted<string>;
  authRealm?: string;
  fetcher?: KeycloakFetcher;
}

const providerJson = async <Schema extends TSchema>(response: Response, schema: Schema) => {
  if (!response.ok) {
    return Result.err(identityErrors.PROVIDER_UNAVAILABLE({ internal: { provider: "keycloak" } }));
  }
  return Result.tryPromise({
    try: async () => Value.Parse(schema, await response.json()),
    catch: () => identityErrors.PROVIDER_UNAVAILABLE({ internal: { provider: "keycloak" } }),
  });
};

const roleFor = (roles: ReadonlySet<string>): ManagedRole | null => {
  if (roles.has("admin")) return "admin";
  if (roles.has("user")) return "user";
  return null;
};

export class KeycloakAdminClient {
  private readonly baseUrl: string;
  private readonly realm: string;
  private readonly authRealm: string;
  private readonly clientId: string;
  private readonly clientSecret: Redacted.Redacted<string>;
  private readonly fetcher: KeycloakFetcher;

  constructor(options: KeycloakAdminClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.realm = options.realm;
    this.authRealm = options.authRealm ?? options.realm;
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetcher = options.fetcher ?? fetch;
  }

  private request(path: string, init?: RequestInit) {
    return Result.tryPromise({
      try: () => this.fetcher(`${this.baseUrl}${path}`, init),
      catch: () => identityErrors.PROVIDER_UNAVAILABLE({ internal: { provider: "keycloak" } }),
    });
  }

  async accessToken() {
    const response = await this.request(
      `/realms/${encodeURIComponent(this.authRealm)}/protocol/openid-connect/token`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: this.clientId,
          client_secret: Redacted.value(this.clientSecret),
        }),
      },
    );
    if (response.isErr()) return response;
    const payload = await providerJson(response.value, KeycloakAccessTokenSchema);
    if (payload.isErr()) return payload;
    return Result.ok(payload.value.access_token);
  }

  private async authorizedJson<Schema extends TSchema>(
    path: string,
    token: string,
    schema: Schema,
    init?: RequestInit,
  ) {
    const headers = new Headers(init?.headers);
    headers.set("authorization", `Bearer ${token}`);
    const response = await this.request(path, {
      ...init,
      headers,
    });
    return response.isErr() ? response : providerJson(response.value, schema);
  }

  private usersPath(parameters: URLSearchParams): string {
    return `/admin/realms/${encodeURIComponent(this.realm)}/users?${parameters.toString()}`;
  }

  private async managedRolesByUser(token: string) {
    const rolesByUser = new Map<string, Set<string>>();
    for (const role of ["admin", "user"]) {
      const response = await this.request(
        `/admin/realms/${encodeURIComponent(this.realm)}/roles/${role}/users?briefRepresentation=true&max=-1`,
        { headers: { authorization: `Bearer ${token}` } },
      );
      if (response.isErr()) return response;
      if (response.value.status === 404) continue;
      const users = await providerJson(response.value, KeycloakRoleUsersSchema);
      if (users.isErr()) return users;
      for (const user of users.value) {
        if (user.id === undefined) continue;
        const roles = rolesByUser.get(user.id) ?? new Set<string>();
        roles.add(role);
        rolesByUser.set(user.id, roles);
      }
    }
    return Result.ok(rolesByUser);
  }

  private mapUsers(
    users: readonly KeycloakAdminUser[],
    rolesByUser: ReadonlyMap<string, ReadonlySet<string>>,
  ): IdentityProviderUser[] {
    return users.flatMap((user) => {
      if (user.id === undefined || user.username === undefined) return [];
      return [
        {
          userId: user.id,
          username: user.username,
          enabled: user.enabled ?? true,
          email: user.email ?? null,
          firstName: user.firstName ?? null,
          lastName: user.lastName ?? null,
          role: roleFor(rolesByUser.get(user.id) ?? new Set()),
        },
      ];
    });
  }

  async listUsers(search: string) {
    const token = await this.accessToken();
    if (token.isErr()) return token;
    const parameters = new URLSearchParams({ first: "0", max: "100" });
    parameters.set("search", search);
    const users = await this.authorizedJson(
      this.usersPath(parameters),
      token.value,
      KeycloakAdminUsersSchema,
    );
    if (users.isErr()) return users;
    if (users.value.length === 0) return Result.ok([]);
    const roles = await this.managedRolesByUser(token.value);
    return roles.isErr() ? roles : Result.ok(this.mapUsers(users.value, roles.value));
  }

  async listAllUsers() {
    const token = await this.accessToken();
    if (token.isErr()) return token;
    const roles = await this.managedRolesByUser(token.value);
    if (roles.isErr()) return roles;
    const users: KeycloakAdminUser[] = [];
    const pageSize = 100;
    for (let first = 0; ; first += pageSize) {
      const page = await this.authorizedJson(
        this.usersPath(new URLSearchParams({ first: String(first), max: String(pageSize) })),
        token.value,
        KeycloakAdminUsersSchema,
      );
      if (page.isErr()) return page;
      users.push(...page.value);
      if (page.value.length < pageSize) break;
    }
    return Result.ok(this.mapUsers(users, roles.value));
  }

  async replaceManagedRoles(userId: string, requestedRoles: readonly ManagedRole[]) {
    const token = await this.accessToken();
    if (token.isErr()) return token;
    const realmPath = `/admin/realms/${encodeURIComponent(this.realm)}`;
    const allRoles = await this.authorizedJson(
      `${realmPath}/roles`,
      token.value,
      KeycloakRolesSchema,
    );
    if (allRoles.isErr()) return allRoles;
    const roleByName = new Map(
      allRoles.value.flatMap((role) => (role.name === undefined ? [] : [[role.name, role]])),
    );
    const mappingPath = `${realmPath}/users/${encodeURIComponent(userId)}/role-mappings/realm`;
    const currentRoles = await this.authorizedJson(mappingPath, token.value, KeycloakRolesSchema);
    if (currentRoles.isErr()) return currentRoles;
    if (!currentRoles.value.some((role) => role.name === "test-role-switcher")) {
      return Result.err(identityErrors.ROLE_SWITCH_FORBIDDEN());
    }
    const requested = new Set(requestedRoles);
    const removable = currentRoles.value.filter(
      (role) =>
        (role.name === "admin" || role.name === "user") &&
        !requested.has(role.name),
    );
    if (removable.length > 0) {
      const response = await this.request(mappingPath, {
        method: "DELETE",
        headers: {
          authorization: `Bearer ${token.value}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(removable),
      });
      if (response.isErr()) return response;
      if (!response.value.ok) {
        return Result.err(
          identityErrors.PROVIDER_UNAVAILABLE({ internal: { provider: "keycloak" } }),
        );
      }
    }

    const current = new Set(
      currentRoles.value.flatMap((role) => (role.name === undefined ? [] : [role.name])),
    );
    const additions: KeycloakRole[] = [];
    for (const role of requestedRoles) {
      if (current.has(role)) continue;
      const representation = roleByName.get(role);
      if (!representation) {
        return Result.err(
          identityErrors.PROVIDER_UNAVAILABLE({ internal: { provider: "keycloak" } }),
        );
      }
      additions.push(representation);
    }
    if (additions.length > 0) {
      const response = await this.request(mappingPath, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token.value}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(additions),
      });
      if (response.isErr()) return response;
      if (!response.value.ok) {
        return Result.err(
          identityErrors.PROVIDER_UNAVAILABLE({ internal: { provider: "keycloak" } }),
        );
      }
    }
    return Result.ok(undefined);
  }
}
