import { describe, expect, test } from "bun:test";
import { EvlogError } from "evlog";
import { Redacted } from "effect";

import {
  assertKeycloakAdminReadFixtureComplete,
  createKeycloakAdminReadFixture,
} from "../scripts/keycloak-admin-read-fake.ts";
import {
  KeycloakAdminClient,
  type KeycloakFetcher,
} from "../src/providers/keycloak.ts";

const CLIENT_SECRET = "unit-runtime-secret";

const fixtureFetch = (respond: (request: Request) => Promise<Response>): KeycloakFetcher => {
  const fetcher: KeycloakFetcher = (input, init) =>
    respond(input instanceof Request ? input : new Request(input.toString(), init));
  return fetcher;
};

const clientFor = (fetcher: KeycloakFetcher, realm = "fixture") =>
  new KeycloakAdminClient({
    baseUrl: "http://127.0.0.1:19090",
    realm,
    clientId: realm === "fixture" ? "identity-fixture-client" : "identity-read-test",
    clientSecret: Redacted.make(CLIENT_SECRET),
    fetcher,
  });

describe("Keycloak Admin adapter", () => {
  test("preserves pagination, role mapping, search, empty results, and provider failure", async () => {
    const boundary = await createKeycloakAdminReadFixture(CLIENT_SECRET);
    const client = clientFor(fixtureFetch((request) => boundary.respond(request)));

    const users = (await client.listAllUsers()).unwrap();
    expect(users.find(({ username }) => username === "fixture-page-000")).toMatchObject({
      role: null,
    });
    expect(users.find(({ username }) => username === "fixture-page-099")).toMatchObject({
      role: null,
    });
    expect(users.find(({ username }) => username === "fixture-alice")).toMatchObject({
      role: "user",
    });
    expect(users.find(({ username }) => username === "fixture-carol")).toMatchObject({
      role: "admin",
    });

    expect((await client.listUsers("alice")).unwrap()).toEqual([
      {
        userId: "10000000-0000-0000-0000-000000000001",
        username: "fixture-alice",
        enabled: true,
        email: "alice@example.test",
        firstName: "Alice",
        lastName: "Fixture",
        role: "user",
      },
    ]);
    expect((await client.listUsers("nobody")).unwrap()).toEqual([]);
    const providerFailure = await client.listUsers("provider-error");
    if (providerFailure.isOk()) throw new Error("expected Keycloak provider failure");
    const providerError = providerFailure.error;
    expect(EvlogError.isEvlogError(providerError)).toBeTrue();

    assertKeycloakAdminReadFixtureComplete(boundary);
  });


  test("fails closed without exposing provider payloads", async () => {
    const client = clientFor(async () =>
      Response.json({ detail: "fixture role provider unavailable" }, { status: 503 }),
    );

    const failure = await client.replaceManagedRoles("30000000-0000-0000-0000-000000000001", [
      "user",
    ]);
    expect(failure).toMatchObject({ status: "error", error: { status: 500 } });
    expect(JSON.stringify(failure)).not.toContain("fixture role provider unavailable");
  });

  test("treats absent managed realm roles as an empty mapping", async () => {
    const fetcher: KeycloakFetcher = async (input, init) => {
      const request = input instanceof Request ? input : new Request(input.toString(), init);
      const url = new URL(request.url);
      if (url.pathname.endsWith("/protocol/openid-connect/token")) {
        return Response.json({ access_token: "runtime-token" });
      }
      if (url.pathname === "/admin/realms/fixture/users") {
        return Response.json([
          {
            id: "00000000-0000-0000-0000-000000000001",
            username: "roleless-user",
            enabled: true,
            email: "roleless@example.test",
          },
        ]);
      }
      return Response.json({ detail: "role missing" }, { status: 404 });
    };
    const client = clientFor(fetcher);

    expect((await client.listUsers("roleless")).unwrap()).toEqual([
      {
        userId: "00000000-0000-0000-0000-000000000001",
        username: "roleless-user",
        enabled: true,
        email: "roleless@example.test",
        firstName: null,
        lastName: null,
        role: null,
      },
    ]);
  });
});
