import { defineResource } from "@spark-workflow/resource";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const Environment = Type.Object(
  {
    UNO_HOST: Type.String({ minLength: 1 }),
    UNO_PORT: Type.Integer({ minimum: 1, maximum: 65_535 }),
    UNO_PROTOCOL: Type.Union([Type.Literal("http"), Type.Literal("https")]),
    UNO_TIMEOUT_MS: Type.Integer({ minimum: 1 }),
    UNO_PREFLIGHT_TIMEOUT_MS: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const parseAdministrativeFileDraftConfiguration = (source: typeof process.env) => {
  const environment = Value.Parse(Environment, source);
  return Object.freeze({
    uno: Object.freeze({
      host: environment.UNO_HOST,
      port: environment.UNO_PORT,
      protocol: environment.UNO_PROTOCOL,
      timeoutMilliseconds: environment.UNO_TIMEOUT_MS,
      preflightTimeoutMilliseconds: environment.UNO_PREFLIGHT_TIMEOUT_MS,
    }),
  });
};

export const AdministrativeFileDraftConfiguration = defineResource<
  ReturnType<typeof parseAdministrativeFileDraftConfiguration>
>()("administrative-file-draft/Configuration");
