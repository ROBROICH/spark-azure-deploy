import { Result } from "better-result";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

import { authenticationErrors } from "./errors";
import { normalizeIdentity, type KeycloakClaims } from "./identity";

type KeycloakConfig = {
  baseUrl: string;
  realm: string;
  audience: string;
  jwksUrl?: string;
  algorithms: readonly string[];
};

let cached: { issuer: string; keys: JWTVerifyGetKey } | undefined;

export async function verifyToken(token: string, config: KeycloakConfig) {
  const issuer = `${config.baseUrl.replace(/\/$/, "")}/realms/${config.realm}`;
  if (cached?.issuer !== issuer) {
    cached = {
      issuer,
      keys: createRemoteJWKSet(
        new URL(config.jwksUrl ?? `${issuer}/protocol/openid-connect/certs`),
      ),
    };
  }

  try {
    const { payload } = await jwtVerify<KeycloakClaims>(token, cached.keys, {
      issuer,
      audience: config.audience,
      algorithms: [...config.algorithms],
    });
    return normalizeIdentity(payload);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Token verification failed";
    return Result.err(
      authenticationErrors.INVALID_CREDENTIAL({
        message,
        cause: cause instanceof Error ? cause : undefined,
      }),
    );
  }
}
