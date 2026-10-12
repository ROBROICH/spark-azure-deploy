import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Secret } from "@spark-workflow/http-host/process-output";

export const WorkerMode = Type.Union([
  Type.Literal("none"),
  Type.Literal("agent-orchestration"),
  Type.Literal("document-management"),
  Type.Literal("project-logic"),
  Type.Literal("temporal-job"),
]);

const Environment = Type.Object(
  {
    HOST: Type.String({ minLength: 1 }),
    PORT: Type.Integer({ minimum: 1, maximum: 65_535 }),
    DB_HOST: Type.String({ minLength: 1 }),
    DB_MIGRATE_HOST: Type.String({ minLength: 1 }),
    DB_MIGRATE_USER: Type.String({ minLength: 1 }),
    DB_MIGRATE_PASSWORD: Secret,
    DB_PORT: Type.Integer({ minimum: 1, maximum: 65_535 }),
    DB_NAME: Type.String({ minLength: 1 }),
    DB_USER: Type.String({ minLength: 1 }),
    DB_PASSWORD: Secret,
    ACTIVE_FEATURE_WORKER: WorkerMode,
    PROJECT_LOGIC_SERVICE_CORS_ORIGINS: Type.String(),
    API_POOL: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const parseApplicationEnvironment = (source: typeof process.env) =>
  Value.Parse(Environment, source);

export type ApplicationEnvironment = ReturnType<typeof parseApplicationEnvironment>;
