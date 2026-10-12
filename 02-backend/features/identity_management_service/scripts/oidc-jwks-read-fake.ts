import {type IdentityReadFixture, loadIdentityReadFixture, } from "../test/support/contracts.ts";
import type {HttpJson} from "@spark-workflow/http-host";

export const IDENTITY_READ_REALM = "identity-read-fixture";
export const IDENTITY_READ_AUDIENCE = "identity-read-test";

const CERTS_PATH = `/realms/${IDENTITY_READ_REALM}/protocol/openid-connect/certs`;

type RuntimeTokenName = keyof IdentityReadFixture["authClaims"] | "invalidCredential";
type RuntimeTokens = Readonly<Record<RuntimeTokenName, string>>;
type AuthClaim = IdentityReadFixture["authClaims"][keyof IdentityReadFixture["authClaims"]];

interface JwtPayload {
  aud: string;
  email?: string;
  exp: number;
  family_name?: string;
  given_name?: string;
  iat: number;
  iss: string;
  realm_access: { roles: string[] };
  sub: string;
}

export interface OidcJwksBoundaryStatus {
  complete: boolean;
  missing: string[];
  unexpected: string[];
}

export interface OidcJwksReadFixture {
  readonly runtimeTokens: RuntimeTokens;
  respond(request: Request): Promise<Response>;
  status(): OidcJwksBoundaryStatus;
}

const base64Url = (value: string | Uint8Array): string => {
  const bytes = value instanceof Uint8Array ? value : new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
};

const signJwt = async (
  privateKey: CryptoKey,
  kid: string,
  payload: Readonly<JwtPayload>,
): Promise<string> => {
  const header = base64Url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const body = base64Url(JSON.stringify(payload));
  const signingInput = `${header}.${body}`;
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`;
};

const loopbackOrigin = (value: string): string => {
  const url = new URL(value);
  if (
    url.protocol !== "http:" ||
    url.hostname !== "127.0.0.1" ||
    url.origin !== value ||
    url.username !== "" ||
    url.password !== ""
  ) {
    throw new Error("Identity OIDC/JWKS fixture origin must be an exact 127.0.0.1 HTTP origin");
  }
  return url.origin;
};

const json = (status: number, body: HttpJson): Response =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

export function assertOidcJwksReadFixtureComplete(boundary: OidcJwksReadFixture): void {
  const status = boundary.status();
  if (!status.complete) {
    throw new Error(
      `Identity OIDC/JWKS boundary did not observe its declared request: ${JSON.stringify(status)}`,
    );
  }
}

export async function createOidcJwksReadFixture(
  originValue: string,
  issuerOriginValue: string = originValue,
): Promise<OidcJwksReadFixture> {
  const issuerOrigin = loopbackOrigin(issuerOriginValue);
  const fixture = await loadIdentityReadFixture();
  const keyPair = await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSASSA-PKCS1-v1_5",
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  );
  const exportedPublicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  if (!exportedPublicKey.e || !exportedPublicKey.n || exportedPublicKey.kty !== "RSA") {
    throw new Error("Identity OIDC/JWKS fixture generated an invalid RSA public key");
  }

  // A fresh key id forces a long-lived verifier to refresh its cached JWKS.
  const kid = crypto.randomUUID();
  const publicJwks = {
    keys: [
      {
        alg: "RS256",
        e: exportedPublicKey.e,
        kid,
        kty: "RSA",
        n: exportedPublicKey.n,
        use: "sig",
      },
    ],
  };
  const issuedAt = Math.floor(Date.now() / 1_000);
  const signClaim = async (claim: AuthClaim): Promise<string> => {
    const payload: JwtPayload = {
      aud: IDENTITY_READ_AUDIENCE,
      exp: issuedAt + 600,
      iat: issuedAt - 5,
      iss: `${issuerOrigin}/realms/${IDENTITY_READ_REALM}`,
      realm_access: { roles: claim.roles },
      sub: claim.sub,
    };
    if (claim.email !== undefined) payload.email = claim.email;
    if (claim.givenName !== undefined) payload.given_name = claim.givenName;
    if (claim.familyName !== undefined) payload.family_name = claim.familyName;
    return signJwt(keyPair.privateKey, kid, payload);
  };
  const [completeAdmin, optionalNamesUser, completeService, missingEmail, unsupportedRole] =
    await Promise.all([
      signClaim(fixture.authClaims.completeAdmin),
      signClaim(fixture.authClaims.optionalNamesUser),
      signClaim(fixture.authClaims.completeService),
      signClaim(fixture.authClaims.missingEmail),
      signClaim(fixture.authClaims.unsupportedRole),
    ]);
  const runtimeTokens = Object.freeze({
    completeAdmin,
    optionalNamesUser,
    completeService,
    missingEmail,
    unsupportedRole,
    invalidCredential: "not-a-jwt",
  }) satisfies RuntimeTokens;

  const unexpectedRequests: string[] = [];
  let seen = false;

  return {
    runtimeTokens,
    async respond(request) {
      const url = new URL(request.url);
      const label = `${request.method} ${url.pathname}${url.search}`;
      if (request.method !== "GET" || url.pathname !== CERTS_PATH || url.search !== "") {
        const detail = `Unexpected OIDC/JWKS request: ${label}`;
        unexpectedRequests.push(detail);
        return json(500, { detail });
      }
      seen = true;
      return json(200, publicJwks);
    },
    status() {
      const missing = seen ? [] : [`GET ${CERTS_PATH}`];
      return {
        complete: missing.length === 0 && unexpectedRequests.length === 0,
        missing,
        unexpected: [...unexpectedRequests],
      };
    },
  };
}
