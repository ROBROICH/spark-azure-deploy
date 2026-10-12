import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { SignJWT, exportJWK, generateKeyPair } from "jose";

import { verifyToken } from "../src/oidc";

const issuerPath = "/realms/test";
const audience = "oidc-test-client";
const subject = "00000000-0000-0000-0000-000000000042";

let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;
let server: ReturnType<typeof Bun.serve>;
let issuer: string;
let jwksRequests = 0;

beforeAll(async () => {
  const primary = await generateKeyPair("RS256");
  const other = await generateKeyPair("RS256");
  privateKey = primary.privateKey;
  otherPrivateKey = other.privateKey;
  const publicJwk = await exportJWK(primary.publicKey);
  publicJwk.kid = "test-signing-key";
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  server = Bun.serve({
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === `${issuerPath}/protocol/openid-connect/certs`) {
        jwksRequests += 1;
        return Response.json({ keys: [publicJwk] });
      }
      return new Response("not found", { status: 404 });
    },
  });
  issuer = `http://127.0.0.1:${server.port}${issuerPath}`;
});

afterAll(() => server.stop(true));

async function token(
  key: CryptoKey,
  overrides: { audience?: string; expiresAt?: number; issuer?: string; notBefore?: number } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    enabled: true,
    realm_access: { roles: ["user"] },
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-signing-key" })
    .setSubject(subject)
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? audience)
    .setIssuedAt(now)
    .setNotBefore(overrides.notBefore ?? now - 1)
    .setExpirationTime(overrides.expiresAt ?? now + 60)
    .sign(key);
}

describe("Keycloak token adapter", () => {
  test("verifies signature, issuer, audience, expiry, and caches JWKS", async () => {
    const config = {
      baseUrl: `http://127.0.0.1:${server.port}`,
      realm: "test",
      audience,
      algorithms: ["RS256"],
    };

    expect((await verifyToken(await token(privateKey), config)).unwrap().sub).toBe(subject);
    expect((await verifyToken(await token(privateKey), config)).unwrap().sub).toBe(subject);
    expect(jwksRequests).toBe(1);
  });

  test("rejects bad signature, issuer, audience, and expiry without exposing the token", async () => {
    const config = {
      baseUrl: `http://127.0.0.1:${server.port}`,
      realm: "test",
      audience,
      algorithms: ["RS256"],
    };
    const cases = [
      await token(otherPrivateKey),
      await token(privateKey, { issuer: "https://wrong.invalid/realms/test" }),
      await token(privateKey, { audience: "wrong-audience" }),
      await token(privateKey, { expiresAt: Math.floor(Date.now() / 1000) - 1 }),
      await token(privateKey, { notBefore: Math.floor(Date.now() / 1000) + 60 }),
    ];

    for (const credential of cases) {
      const result = await verifyToken(credential, config);
      expect(result.isErr()).toBe(true);
      if (result.isErr()) expect(result.error.message).not.toContain(credential);
    }
  });
});
