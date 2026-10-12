import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Secret } from "@spark-workflow/http-host/process-output";

const Environment = Type.Object(
  {
    ENV: Type.Optional(Type.String()),
    AUTH_BASE_URL: Type.String({ minLength: 1 }),
    AUTH_REALM: Type.String({ minLength: 1 }),
    AUTH_CLIENT_ID: Type.String({ minLength: 1 }),
    AUTH_CLIENT_SECRET: Secret,
    AUTH_PRIVILEGED_REALM: Type.Optional(Type.String({ minLength: 1 })),
    AUTH_PRIVILEGED_CLIENT_ID: Type.Optional(Type.String({ minLength: 1 })),
    AUTH_PRIVILEGED_CLIENT_SECRET: Type.Optional(Secret),
    AUTH_SPICE_DB_ENDPOINT: Type.String({ minLength: 1 }),
    AUTH_SPICE_DB_TOKEN: Secret,
    AUTH_SPICE_DB_CERT_PATH: Type.Optional(Type.String({ minLength: 1 })),
    AUTH_SPICE_DB_INSECURE: Type.Boolean(),
    AUTH_SPICE_DB_BULK_CHUNK_SIZE: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export function parseIdentityEnvironment(source: typeof process.env) {
  const parsed = Value.Parse(Environment, source);
  const privilegedRealm = parsed.AUTH_PRIVILEGED_REALM;
  const privilegedClientId = parsed.AUTH_PRIVILEGED_CLIENT_ID;
  const privilegedClientSecret = parsed.AUTH_PRIVILEGED_CLIENT_SECRET;
  if (
    (privilegedRealm === undefined) !== (privilegedClientId === undefined) ||
    (privilegedRealm === undefined) !== (privilegedClientSecret === undefined)
  ) {
    throw new TypeError(
      "AUTH_PRIVILEGED_REALM, AUTH_PRIVILEGED_CLIENT_ID, and AUTH_PRIVILEGED_CLIENT_SECRET must be set together",
    );
  }
  return Object.freeze({
    ...parsed,
    AUTH_PRIVILEGED:
      privilegedRealm === undefined ||
      privilegedClientId === undefined ||
      privilegedClientSecret === undefined
        ? null
        : {
            realm: privilegedRealm,
            clientId: privilegedClientId,
            clientSecret: privilegedClientSecret,
          },
  });
}

export type IdentityEnvironment = ReturnType<typeof parseIdentityEnvironment>;
