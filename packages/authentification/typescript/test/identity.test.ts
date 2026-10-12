import { describe, expect, test } from "bun:test";

import { parseAuthConfig } from "../src/config";
import { normalizeIdentity } from "../src/identity";
import { machineIdentityFromXfcc } from "../src/machine-identity";

const subject = "00000000-0000-0000-0000-000000000042";

describe("identity normalization", () => {
  test("keeps only public claims and selects a known role", () => {
    const claims = {
      sub: subject,
      realm_access: { roles: ["unknown", "user", "admin"] },
      private_provider_claim: "must-not-cross-the-boundary",
    };
    const identity = normalizeIdentity(claims);
    expect(identity.isOk()).toBe(true);
    if (identity.isErr()) return;
    expect(identity.value).toMatchObject({
      sub: subject,
      realmRoles: ["unknown", "user", "admin"],
      role: "admin",
      kind: "human",
    });
    expect(identity.value).not.toHaveProperty("private_provider_claim");
  });

  test("rejects missing, invalid, and inactive subjects", () => {
    expect(normalizeIdentity({ realm_access: { roles: ["user"] } }).isErr()).toBe(true);
    expect(normalizeIdentity({ sub: "not-a-uuid" }).isErr()).toBe(true);
    expect(normalizeIdentity({ sub: subject, enabled: false }).isErr()).toBe(true);
  });
});

describe("machine identity", () => {
  test("accepts one allowed SPIFFE URI", () => {
    expect(
      machineIdentityFromXfcc(
        'By=proxy;URI="spiffe://cluster.local/ns/backend/sa/project-logic"',
        "spiffe://cluster.local/ns/backend/sa/*",
      ),
    ).toEqual({
      namespace: "backend",
      serviceAccount: "project-logic",
      allowed: true,
    });
  });

  test("rejects malformed or ambiguous forwarded certificates", () => {
    expect(machineIdentityFromXfcc("By=proxy;URI=https://example.invalid", "*")).toBeNull();
    expect(
      machineIdentityFromXfcc("URI=spiffe://one/ns/a/sa/b;URI=spiffe://two/ns/a/sa/b", "*"),
    ).toBeNull();
  });
});

describe("configuration", () => {
  test("disabled mode needs no provider settings", () => {
    expect(parseAuthConfig({ AUTH_MODE: "disabled" }).unwrap()).toEqual({ mode: "disabled" });
  });

  test("strict mode fails fast when OIDC settings are absent", () => {
    const result = parseAuthConfig({ AUTH_MODE: "strict" });
    expect(result.isErr()).toBe(true);
    if (result.isErr()) expect(result.error.message).toContain("AUTH_BASE_URL");
  });

  test("normalizes the OIDC URL and parses explicit insecure SpiceDB transport", () => {
    expect(
      parseAuthConfig({
        AUTH_MODE: "strict",
        AUTH_BASE_URL: "https://identity.example/",
        AUTH_REALM: "example",
        AUTH_AUDIENCE: "api",
        AUTH_SPICE_DB_ENDPOINT: "spicedb:50051",
        AUTH_SPICE_DB_TOKEN: "secret",
        AUTH_SPICE_DB_INSECURE: "true",
      }).unwrap(),
    ).toMatchObject({
      baseUrl: "https://identity.example",
      spiceDb: { insecure: true },
    });
  });

  test("strict OIDC can run without SpiceDB", () => {
    expect(
      parseAuthConfig({
        AUTH_MODE: "strict",
        AUTH_BASE_URL: "https://identity.example",
        AUTH_REALM: "example",
        AUTH_AUDIENCE: "api",
      }).unwrap(),
    ).toMatchObject({ mode: "strict", spiceDb: undefined });
  });

  test("rejects half-configured SpiceDB", () => {
    expect(
      parseAuthConfig({
        AUTH_MODE: "strict",
        AUTH_BASE_URL: "https://identity.example",
        AUTH_REALM: "example",
        AUTH_AUDIENCE: "api",
        AUTH_SPICE_DB_ENDPOINT: "spicedb:50051",
      }).isErr(),
    ).toBe(true);
  });
});
