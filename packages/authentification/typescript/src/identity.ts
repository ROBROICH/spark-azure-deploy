import { Result } from "better-result";

import type { OidcRole } from "./enums";
import { authenticationErrors } from "./errors";

export type NormalizedIdentity = {
  sub: string;
  realmRoles: string[];
  role: OidcRole | null;
  email?: string;
  givenName?: string;
  familyName?: string;
  kind: "human" | "machine";
};

export type KeycloakClaims = {
  sub?: string;
  realm_access?: { roles?: string[] };
  email?: string;
  given_name?: string;
  family_name?: string;
  enabled?: boolean;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalString = (value: string | undefined) => value?.trim() || undefined;

export function normalizeIdentity(payload: KeycloakClaims) {
  const sub = optionalString(payload.sub);
  if (!sub || !uuidPattern.test(sub)) {
    return Result.err(
      authenticationErrors.INVALID_CREDENTIAL({ message: "Invalid token subject" }),
    );
  }

  const realmRoles = (payload.realm_access?.roles ?? []).map((role) => role.trim()).filter(Boolean);
  const enabled = payload.enabled !== false;
  if (!enabled) {
    return Result.err(authenticationErrors.INVALID_CREDENTIAL({ message: "User not active" }));
  }

  return Result.ok({
    sub,
    realmRoles,
    role: (["admin", "user", "service"] as const).find((role) => realmRoles.includes(role)) ?? null,
    email: optionalString(payload.email),
    givenName: optionalString(payload.given_name),
    familyName: optionalString(payload.family_name),
    kind: "human",
  } as const satisfies NormalizedIdentity);
}

export function machineUser(_namespace: string, _serviceAccount: string): NormalizedIdentity {
  return {
    sub: "00000000-0000-0000-0000-000000000001",
    realmRoles: ["service"],
    role: "service",
    kind: "machine",
  };
}
