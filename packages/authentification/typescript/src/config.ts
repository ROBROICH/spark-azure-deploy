import { Result } from "better-result";
import { Redacted } from "effect";

import { authenticationErrors } from "./errors";

type Environment = Readonly<Record<string, string | undefined>>;

const requiredKeys = ["AUTH_BASE_URL", "AUTH_REALM", "AUTH_AUDIENCE"] as const;

const requiredValue = (environment: Environment, key: string) => environment[key]?.trim() ?? "";

export function parseAuthConfig(environment: Environment = Bun.env) {
  const configuredMode = environment.AUTH_MODE ?? "strict";
  if (configuredMode !== "disabled" && configuredMode !== "strict") {
    return Result.err(
      authenticationErrors.INVALID_CONFIGURATION({
        message: "AUTH_MODE must be one of disabled, strict",
      }),
    );
  }

  if (configuredMode === "disabled") return Result.ok({ mode: "disabled" } as const);

  const missing = requiredKeys.filter((key) => requiredValue(environment, key) === "");
  if (missing.length > 0) {
    return Result.err(
      authenticationErrors.INVALID_CONFIGURATION({
        message: `Missing required authentication settings: ${missing.join(", ")}`,
        internal: { missing },
      }),
    );
  }

  const algorithms = (environment.AUTH_ALGORITHMS ?? "RS256")
    .split(",")
    .map((algorithm) => algorithm.trim())
    .filter(Boolean);
  if (algorithms.length === 0) {
    return Result.err(
      authenticationErrors.INVALID_CONFIGURATION({
        message: "AUTH_ALGORITHMS must contain at least one value",
      }),
    );
  }

  const spiceDbEndpoint = requiredValue(environment, "AUTH_SPICE_DB_ENDPOINT");
  const spiceDbToken = requiredValue(environment, "AUTH_SPICE_DB_TOKEN");
  if ((spiceDbEndpoint === "") !== (spiceDbToken === "")) {
    return Result.err(
      authenticationErrors.INVALID_CONFIGURATION({
        message: "AUTH_SPICE_DB_ENDPOINT and AUTH_SPICE_DB_TOKEN must be configured together",
      }),
    );
  }

  return Result.ok({
    mode: "strict",
    baseUrl: requiredValue(environment, "AUTH_BASE_URL").replace(/\/$/, ""),
    realm: requiredValue(environment, "AUTH_REALM"),
    audience: requiredValue(environment, "AUTH_AUDIENCE"),
    jwksUrl: environment.AUTH_JWKS_URL?.trim() || undefined,
    algorithms,
    spiceDb:
      spiceDbEndpoint === ""
        ? undefined
        : {
            endpoint: spiceDbEndpoint,
            token: Redacted.make(spiceDbToken),
            certPath: environment.AUTH_SPICE_DB_CERT_PATH?.trim() || undefined,
            insecure: environment.AUTH_SPICE_DB_INSECURE?.toLowerCase() === "true",
          },
    allowedMachineIdentities: environment.AUTH_ALLOWED_MACHINE_IDENTITIES?.trim() ?? "",
  } as const);
}
