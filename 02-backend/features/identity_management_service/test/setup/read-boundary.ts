import { afterAll } from "bun:test";

import {
  assertKeycloakAdminReadFixtureComplete,
  createKeycloakAdminReadFixture,
  type KeycloakAdminReadFixture,
} from "../../scripts/keycloak-admin-read-fake.ts";
import {
  assertOidcJwksReadFixtureComplete,
  createOidcJwksReadFixture,
  type OidcJwksReadFixture,
} from "../../scripts/oidc-jwks-read-fake.ts";

let keycloakAdminBoundary: KeycloakAdminReadFixture | undefined;
let oidcJwksBoundary: OidcJwksReadFixture | undefined;
const stopServers: Array<() => void> = [];
let ownsRuntimeTokens = false;
const previousRuntimeTokens = process.env.IDENTITY_READ_TOKENS;

const fixedPort = (name: string): number => {
  const port = Number(process.env[name]);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`${name} must be a fixed TCP port for the external Identity read profile`);
  }
  return port;
};

const restoreRuntimeTokens = (): void => {
  if (!ownsRuntimeTokens) return;
  if (previousRuntimeTokens === undefined) delete process.env.IDENTITY_READ_TOKENS;
  else process.env.IDENTITY_READ_TOKENS = previousRuntimeTokens;
  ownsRuntimeTokens = false;
};

const stopOwnedServers = (): void => {
  for (const stop of stopServers.reverse()) stop();
  stopServers.length = 0;
};

try {
  if (process.env.IDENTITY_READ_USERS_URL !== undefined) {
    const port = fixedPort("IDENTITY_OIDC_ADMIN_FAKE_PORT");
    const clientSecret = process.env.AUTH_CLIENT_SECRET;
    if (clientSecret === undefined || clientSecret === "") {
      throw new Error("AUTH_CLIENT_SECRET must match the Identity read-profile provider client");
    }

    const boundary = await createKeycloakAdminReadFixture(clientSecret);
    keycloakAdminBoundary = boundary;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch: (request) => boundary.respond(request),
    });
    stopServers.push(() => server.stop(true));
  }

  if (process.env.IDENTITY_READ_ME_URL !== undefined) {
    const port = fixedPort("IDENTITY_OIDC_JWKS_FAKE_PORT");
    const origin = `http://127.0.0.1:${port}`;
    const boundary = await createOidcJwksReadFixture(
      origin,
      process.env.IDENTITY_READ_ISSUER_ORIGIN,
    );
    oidcJwksBoundary = boundary;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch: (request) => boundary.respond(request),
    });
    stopServers.push(() => server.stop(true));
    process.env.IDENTITY_READ_TOKENS = JSON.stringify(boundary.runtimeTokens);
    ownsRuntimeTokens = true;
  }
} catch (error) {
  stopOwnedServers();
  restoreRuntimeTokens();
  throw error;
}

if (
  keycloakAdminBoundary !== undefined ||
  oidcJwksBoundary !== undefined
) {
  afterAll(() => {
    stopOwnedServers();
    restoreRuntimeTokens();

    const failures: unknown[] = [];
    if (keycloakAdminBoundary !== undefined) {
      try {
        assertKeycloakAdminReadFixtureComplete(keycloakAdminBoundary);
      } catch (error) {
        failures.push(error);
      }
    }
    if (oidcJwksBoundary !== undefined) {
      try {
        assertOidcJwksReadFixtureComplete(oidcJwksBoundary);
      } catch (error) {
        failures.push(error);
      }
    }

    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, "Identity provider boundaries were not satisfied");
    }
  });
}
