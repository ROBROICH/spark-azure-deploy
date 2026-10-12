import { describe, expect, test } from "bun:test";
import {
  assertOidcJwksReadFixtureComplete,
  createOidcJwksReadFixture,
  IDENTITY_READ_AUDIENCE,
  IDENTITY_READ_REALM,
} from "../scripts/oidc-jwks-read-fake.ts";

const FIXTURE_ORIGIN = "http://127.0.0.1:43227";
const CERTS_PATH = `/realms/${IDENTITY_READ_REALM}/protocol/openid-connect/certs`;

const base64UrlBytes = (value: string): Uint8Array<ArrayBuffer> => {
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const decoded = atob(padded);
  const bytes = new Uint8Array(decoded.length);
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
};

const base64UrlJson = (value: string): object =>
  JSON.parse(new TextDecoder().decode(base64UrlBytes(value))) as object;

describe("Identity-owned OIDC/JWKS fixture", () => {
  test("generates ephemeral RS256 tokens from the committed claims", async () => {
    const boundary = await createOidcJwksReadFixture(FIXTURE_ORIGIN);
    const response = await boundary.respond(new Request(`${FIXTURE_ORIGIN}${CERTS_PATH}`));
    const jwks = (await response.json()) as {
      keys: Array<Record<string, string>>;
    };
    const key = jwks.keys.find(
      ({ alg, kty, use }) => alg === "RS256" && kty === "RSA" && use === "sig",
    );
    if (key === undefined) throw new Error("OIDC fixture did not return a public key");

    expect(response.status).toBe(200);
    expect(boundary.runtimeTokens.invalidCredential).toBe("not-a-jwt");
    expect(key).toMatchObject({ alg: "RS256", kty: "RSA", use: "sig" });
    expect(key.kid).toBeString();
    expect(key.kid).not.toBe("");

    const tokenParts = boundary.runtimeTokens.completeAdmin.split(".");
    expect(tokenParts).toHaveLength(3);
    const [encodedHeader, encodedPayload, encodedSignature] = tokenParts;
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new Error("OIDC fixture generated an incomplete JWT");
    }
    expect(base64UrlJson(encodedHeader)).toEqual({ alg: "RS256", kid: key.kid, typ: "JWT" });
    expect(base64UrlJson(encodedPayload)).toMatchObject({
      aud: IDENTITY_READ_AUDIENCE,
      email: "ada.admin@example.test",
      family_name: "Admin",
      given_name: "Ada",
      iss: `${FIXTURE_ORIGIN}/realms/${IDENTITY_READ_REALM}`,
      realm_access: { roles: ["admin"] },
      sub: "30000000-0000-0000-0000-000000000001",
    });
    const payload = base64UrlJson(encodedPayload);
    expect(Object.hasOwn(payload, "familyName")).toBeFalse();
    expect(Object.hasOwn(payload, "givenName")).toBeFalse();
    expect(Object.hasOwn(payload, "realmAccess")).toBeFalse();

    const verificationKey = await crypto.subtle.importKey(
      "jwk",
      key,
      { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
      false,
      ["verify"],
    );
    expect(
      await crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        verificationKey,
        base64UrlBytes(encodedSignature),
        new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
      ),
    ).toBeTrue();
    expect(() => assertOidcJwksReadFixtureComplete(boundary)).not.toThrow();
  });

  test("requires its declared request, rejects unexpected requests, and permits repeats", async () => {
    const missing = await createOidcJwksReadFixture(FIXTURE_ORIGIN);
    expect(() => assertOidcJwksReadFixtureComplete(missing)).toThrow();

    const unexpected = await createOidcJwksReadFixture(FIXTURE_ORIGIN);
    const unexpectedResponse = await unexpected.respond(
      new Request(`${FIXTURE_ORIGIN}${CERTS_PATH}?undeclared=true`, { method: "POST" }),
    );
    expect(unexpectedResponse.status).toBe(500);
    expect(unexpected.status().unexpected).not.toEqual([]);
    expect(() => assertOidcJwksReadFixtureComplete(unexpected)).toThrow();

    const repeated = await createOidcJwksReadFixture(FIXTURE_ORIGIN);
    const exactRequest = () => new Request(`${FIXTURE_ORIGIN}${CERTS_PATH}`);
    expect((await repeated.respond(exactRequest())).status).toBe(200);
    expect((await repeated.respond(exactRequest())).status).toBe(200);
    expect(() => assertOidcJwksReadFixtureComplete(repeated)).not.toThrow();
  });

  test("uses a fresh key identity for separately invoked ordinary suites", async () => {
    const first = await createOidcJwksReadFixture(FIXTURE_ORIGIN);
    const second = await createOidcJwksReadFixture(FIXTURE_ORIGIN);
    const request = () => new Request(`${FIXTURE_ORIGIN}${CERTS_PATH}`);
    const firstJwks = (await first.respond(request()).then((response) => response.json())) as {
      keys: Array<{ kid: string }>;
    };
    const secondJwks = (await second.respond(request()).then((response) => response.json())) as {
      keys: Array<{ kid: string }>;
    };

    const firstKey = firstJwks.keys.find(({ kid }) => kid !== "");
    const secondKey = secondJwks.keys.find(({ kid }) => kid !== "");
    if (firstKey === undefined || secondKey === undefined) {
      throw new Error("OIDC fixture did not return key identities");
    }
    expect(firstKey.kid).not.toBe(secondKey.kid);
  });
});
