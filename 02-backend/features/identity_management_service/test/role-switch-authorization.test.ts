import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createFeatureHttp, createHttpHost } from "@spark-workflow/http-host";
import { createPostgresRuntime, PostgreSQL, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provideValue } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import { Redacted } from "effect";
import type { Elysia } from "elysia";
import { Type as T } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { identityDatabaseSchema } from "../src/db/schema.ts";
import { createRoutes, feature, IdentityConfiguration } from "../src/index.ts";
import { parseIdentityEnvironment, type IdentityEnvironment } from "../src/env.ts";
import { KeycloakAdminClient } from "../src/providers/keycloak.ts";

const enabled = process.env.IDENTITY_ROLE_NATIVE_TEST === "true";
const nativeTest = enabled ? test : test.skip;
const nonProductionEnvironments = ["local", "development"] as const;
const deniedEnvironments = ["production", "preview"] as const;
const apps = new Map<string, Pick<Elysia, "handle">>();
let nonProductionApp: Pick<Elysia, "handle">;
let database: PostgresResourceRuntime<typeof identityDatabaseSchema> | undefined;
const closeResources: Array<() => Promise<void>> = [];
const eligibilityRole = "test-role-switcher";

type Account = { id: string; username: string; password: string };
type RealmRole = { id: string; name: string };
let environment: IdentityEnvironment;
let adminToken: string;
let realmUrl: string;
let ordinary: Account;
let unentitledAdmin: Account;
let tester: Account;
const createdUsers: string[] = [];
const realmRoles: RealmRole[] = [];
let createdEligibilityRole = false;

async function createAccount(roles: readonly string[]): Promise<Account> {
  const username = `role-switch-${crypto.randomUUID()}`;
  const password = crypto.randomUUID();
  const response = await fetch(`${realmUrl}/users`, {
    method: "POST",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify({
      username,
      email: `${username}@example.test`,
      emailVerified: true,
      enabled: true,
      firstName: "Role",
      lastName: "Regression",
      credentials: [{ type: "password", value: password, temporary: false }],
    }),
  });
  expect(response.status).toBe(201);
  const location = response.headers.get("location");
  if (!location) throw new Error("Keycloak did not return the created user location");
  const id = new URL(location).pathname.split("/").at(-1);
  if (!id) throw new Error("Keycloak did not return the created user id");
  createdUsers.push(id);
  const assignment = await fetch(`${realmUrl}/users/${id}/role-mappings/realm`, {
    method: "POST",
    headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
    body: JSON.stringify(realmRoles.filter((role) => roles.includes(role.name))),
  });
  expect(assignment.status).toBe(204);
  return { id, username, password };
}

async function login(account: Account): Promise<string> {
  const response = await fetch(
    `${environment.AUTH_BASE_URL}/realms/${encodeURIComponent(environment.AUTH_REALM)}/protocol/openid-connect/token`,
    {
      method: "POST",
      body: new URLSearchParams({
        grant_type: "password",
        client_id: environment.AUTH_CLIENT_ID,
        client_secret: Redacted.value(environment.AUTH_CLIENT_SECRET),
        username: account.username,
        password: account.password,
      }),
    },
  );
  expect(response.status).toBe(200);
  const payload = Value.Parse(T.Object({ access_token: T.String({ minLength: 1 }) }), await response.json());
  return payload.access_token;
}

beforeAll(async () => {
  if (!enabled) return;
  const databaseUrl = process.env.IDENTITY_ROLE_DATABASE_URL;
  if (!databaseUrl) throw new Error("IDENTITY_ROLE_DATABASE_URL is required for the native role regression");
  environment = parseIdentityEnvironment(process.env);
  for (const value of [databaseUrl, environment.AUTH_BASE_URL]) {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(value).hostname)) {
      throw new Error("Native role regression only mutates loopback test services");
    }
  }
  database = createPostgresRuntime({
    url: databaseUrl,
    schema: identityDatabaseSchema,
    pool: {
      maxConnections: 2,
      idleTimeoutSeconds: 5,
      connectionTimeoutSeconds: 5,
      maxLifetimeSeconds: 60,
      closeTimeoutSeconds: 5,
    },
  });
  await database.ready();
  for (const runtimeEnvironment of [...nonProductionEnvironments, ...deniedEnvironments]) {
    const resources = makeEffectResourceRuntime(composeFeatures([
      feature,
      defineFeature({
        id: `identity-role-${runtimeEnvironment}-platform`,
        needs: {},
        providers: [
          provideValue(PostgreSQL, database),
          provideValue(IdentityConfiguration, parseIdentityEnvironment({
            ...process.env,
            ENV: runtimeEnvironment,
          })),
        ] as const,
        tables: {},
      }),
    ] as const));
    closeResources.push(() => resources.close());
    await resources.ready();
    const app = createHttpHost(`identity-role-${runtimeEnvironment}`).use(
      createRoutes(createFeatureHttp(resources).for(feature)),
    );
    apps.set(runtimeEnvironment, app);
  }
  nonProductionApp = apps.get("local")!;
  if (!environment.AUTH_PRIVILEGED) throw new Error("Privileged native Keycloak test credentials are required");
  adminToken = (await new KeycloakAdminClient({
    baseUrl: environment.AUTH_BASE_URL,
    realm: environment.AUTH_REALM,
    authRealm: environment.AUTH_PRIVILEGED.realm,
    clientId: environment.AUTH_PRIVILEGED.clientId,
    clientSecret: environment.AUTH_PRIVILEGED.clientSecret,
  }).accessToken()).unwrap();
  realmUrl = `${environment.AUTH_BASE_URL}/admin/realms/${encodeURIComponent(environment.AUTH_REALM)}`;
  for (const name of ["admin", "user", eligibilityRole]) {
    let response = await fetch(`${realmUrl}/roles/${name}`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    if (response.status === 404 && name === eligibilityRole) {
      const created = await fetch(`${realmUrl}/roles`, {
        method: "POST",
        headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      expect(created.status).toBe(201);
      createdEligibilityRole = true;
      response = await fetch(`${realmUrl}/roles/${name}`, {
        headers: { authorization: `Bearer ${adminToken}` },
      });
    }
    expect(response.status).toBe(200);
    realmRoles.push((await response.json()) as RealmRole);
  }
  ordinary = await createAccount(["user"]);
  unentitledAdmin = await createAccount(["admin"]);
  tester = await createAccount(["admin", eligibilityRole]);
});

afterAll(async () => {
  try {
    for (const id of createdUsers) {
      const response = await fetch(`${realmUrl}/users/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(response.status).toBe(204);
    }
    if (createdEligibilityRole) {
      const response = await fetch(`${realmUrl}/roles/${eligibilityRole}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(response.status).toBe(204);
    }
  } finally {
    for (const close of closeResources) await close();
    await database?.close();
  }
});

describe("native role-switch authorization", () => {
  nativeTest("ordinary users and unentitled admins cannot change their own managed roles", async () => {
    for (const [account, originalRole, requestedRole] of [
      [ordinary, "user", "admin"],
      [unentitledAdmin, "admin", "user"],
    ] as const) {
      const response = await nonProductionApp.handle(new Request("http://localhost/me/roles", {
        method: "POST",
        headers: { authorization: `Bearer ${await login(account)}`, "content-type": "application/json" },
        body: JSON.stringify({ roles: [requestedRole] }),
      }));
      expect(response.status).toBe(403);
      const current = await nonProductionApp.handle(new Request("http://localhost/me", {
        headers: { authorization: `Bearer ${await login(account)}` },
      }));
      expect(current.status).toBe(200);
      expect(await current.json()).toMatchObject({ userId: account.id, role: originalRole });
    }
  });

  for (const runtimeEnvironment of nonProductionEnvironments) {
    nativeTest(`an explicitly entitled tester can return to admin after demotion and a fresh login with ENV=${runtimeEnvironment}`, async () => {
      const app = apps.get(runtimeEnvironment)!;
      for (const role of ["user", "admin"] as const) {
        const response = await app.handle(new Request("http://localhost/me/roles", {
          method: "POST",
          headers: { authorization: `Bearer ${await login(tester)}`, "content-type": "application/json" },
          body: JSON.stringify({ roles: [role] }),
        }));
        expect(response.status).toBe(200);
        const logout = await fetch(`${realmUrl}/users/${tester.id}/logout`, {
          method: "POST",
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(logout.status).toBe(204);
        const current = await app.handle(new Request("http://localhost/me", {
          headers: { authorization: `Bearer ${await login(tester)}` },
        }));
        expect(current.status).toBe(200);
        expect(await current.json()).toMatchObject({ userId: tester.id, role });
        const mappings = await fetch(`${realmUrl}/users/${tester.id}/role-mappings/realm`, {
          headers: { authorization: `Bearer ${adminToken}` },
        });
        expect(mappings.status).toBe(200);
        expect(await mappings.json()).toEqual(expect.arrayContaining([expect.objectContaining({ name: eligibilityRole })]));
      }
    });
  }

  nativeTest("the role-switch payload cannot grant its own eligibility", async () => {
    const response = await nonProductionApp.handle(new Request("http://localhost/me/roles", {
      method: "POST",
      headers: { authorization: `Bearer ${await login(ordinary)}`, "content-type": "application/json" },
      body: JSON.stringify({ roles: [eligibilityRole, "admin"] }),
    }));
    expect(response.status).toBe(422);
    const mappings = await fetch(`${realmUrl}/users/${ordinary.id}/role-mappings/realm`, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(mappings.status).toBe(200);
    expect(await mappings.json()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: eligibilityRole })]));
  });

  for (const runtimeEnvironment of deniedEnvironments) {
    nativeTest(`ENV=${runtimeEnvironment} rejects an entitled tester even with privileged credentials configured`, async () => {
      const app = apps.get(runtimeEnvironment)!;
      const response = await app.handle(new Request("http://localhost/me/roles", {
        method: "POST",
        headers: { authorization: `Bearer ${await login(tester)}`, "content-type": "application/json" },
        body: JSON.stringify({ roles: ["user"] }),
      }));
      expect(response.status).toBe(403);
      const current = await app.handle(new Request("http://localhost/me", {
        headers: { authorization: `Bearer ${await login(tester)}` },
      }));
      expect(current.status).toBe(200);
      expect(await current.json()).toMatchObject({ userId: tester.id, role: "admin" });
    });
  }
});
