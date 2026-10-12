import { afterAll, expect, test } from "bun:test";
import { httpJsonObject, type HttpJson } from "@spark-workflow/http-host";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

Object.assign(process.env, {
  ACTIVE_FEATURE_WORKER: "none",
  ARCHIVAL_BATCH_SIZE: "100",
  ARCHIVAL_CRON: "0 0 * * *",
  ARCHIVAL_ENABLED: "false",
  ARCHIVAL_S3_PREFIX: "archive",
  ARCHIVAL_WORKFLOW_ID: "archive",
  AUTH_BASE_URL: "http://127.0.0.1:8080",
  AUTH_CLIENT_ID: "spark",
  AUTH_CLIENT_SECRET: "test",
  AUTH_MODE: "disabled",
  AUTH_REALM: "spark",
  AUTH_SPICE_DB_BULK_CHUNK_SIZE: "100",
  AUTH_SPICE_DB_ENDPOINT: "127.0.0.1:50051",
  AUTH_SPICE_DB_INSECURE: "true",
  AUTH_SPICE_DB_TOKEN: "test",
  BUCKET_NAME: "dms-local",
  CHECKPOINT_RETENTION_PERIOD_DAYS: "60",
  CLAMAV_BASE_URL: "http://127.0.0.1:3310",
  CLAMAV_ENABLED: "false",
  DB_HOST: "127.0.0.1",
  DB_MIGRATE_HOST: "127.0.0.1",
  DB_MIGRATE_PASSWORD: "test",
  DB_MIGRATE_USER: "application_migrator",
  DB_NAME: "application",
  DB_PASSWORD: "test",
  DB_PORT: "5433",
  DB_USER: "application_runtime",
  DEFAULT_PROJECT_TYPE_ID: "00000000-0000-0000-0000-000000000000",
  DEFAULT_WORKFLOW_COMPLEXITY_WEIGHT: "1",
  ENV: "dev",
  EXTERNAL_SERVICE_TIMEOUT_MS: "10000",
  FPP_ALLOWED_DOMAINS: "fpp.example",
  FPP_BLOCK_PRIVATE_IPS: "true",
  HOST: "127.0.0.1",
  LAW_DATABASE_BASE_URL: "http://127.0.0.1:18100",
  MAX_COMPRESSION_RATIO: "100",
  MAX_OBJECT_SIZE_MB: "1024",
  MAX_SINGLE_ENTRY_SIZE_MB: "1024",
  MAX_SYSTEM_COMPLEXITY: "100",
  MAX_ZIP_APPENDED_DATA_BYTES: "65536",
  MAX_ZIP_ENTRIES: "5000",
  MAX_ZIP_EXTRACTION_SIZE_GB: "10",
  PORT: "18000",
  PROJECT_LOGIC_SERVICE_CORS_ORIGINS: "https://dashboard.example",
  S3_ACCESS_KEY_ID: "test",
  S3_ENDPOINT_URL: "http://127.0.0.1:9000",
  S3_EXTERNAL_URL: "http://127.0.0.1:9000",
  S3_REGION: "eu-west-1",
  S3_SECRET_ACCESS_KEY: "test",
  SYSTEM_USER_ID: "00000000-0000-0000-0000-000000000001",
  TEMPORAL_ENABLE_APPROVAL: "false",
  TEMPORAL_HOST: "127.0.0.1:7233",
  TEMPORAL_MAX_CONCURRENT_ACTIVITIES: "10",
  TEMPORAL_NAMESPACE: "default",
  UNO_HOST: "127.0.0.1",
  UNO_PORT: "2002",
  UNO_PREFLIGHT_TIMEOUT_MS: "1000",
  UNO_PROTOCOL: "http",
  UNO_TIMEOUT_MS: "1000",
  WORKFLOW_COMPLEXITY: "{}",
});

const { createApplication } = await import("../src/index.ts");
const application = await createApplication();
afterAll(() => application.stop());

const methods = new Set(["delete", "get", "head", "options", "patch", "post", "put"]);

const stringSchema = Type.String();

test("publishes one collision-free aggregate contract", async () => {
  const response = await application.app.handle(new Request("http://localhost/openapi.json"));
  expect(response.status).toBe(200);

  const payload: HttpJson = await response.json();
  const specification = httpJsonObject(payload);
  expect(specification).toBeDefined();
  if (specification === undefined) throw new TypeError("OpenAPI document must be an object");
  const paths = httpJsonObject(specification.paths);
  expect(paths).toBeDefined();
  if (paths === undefined) throw new TypeError("OpenAPI paths must be an object");
  const v2Projects = httpJsonObject(httpJsonObject(paths["/api/v2/pls/projects"])?.get);
  const v2Parameters = v2Projects?.parameters;
  if (!Array.isArray(v2Parameters)) throw new TypeError("v2 project parameters must be an array");
  const limit = v2Parameters.find((parameter) => httpJsonObject(parameter)?.name === "limit");
  const limitSchema = httpJsonObject(httpJsonObject(limit)?.schema);
  expect(limitSchema?.anyOf).toHaveLength(2);
  expect(limitSchema?.nullable).toBeUndefined();
  const operationIds: string[] = [];
  for (const item of Object.values(paths)) {
    for (const [method, value] of Object.entries(httpJsonObject(item) ?? {})) {
      if (!methods.has(method)) continue;
      const operationId = httpJsonObject(value)?.operationId;
      expect(Value.Check(stringSchema, operationId)).toBeTrue();
      if (!Value.Check(stringSchema, operationId)) {
        throw new TypeError(`OpenAPI ${method} operation requires an operationId`);
      }
      operationIds.push(operationId);
    }
  }

  expect(new Set(operationIds).size).toBe(operationIds.length);

  const schemas = httpJsonObject(httpJsonObject(specification.components)?.schemas) ?? {};
  const riskMutation = httpJsonObject(schemas.V1AdministrativeFileDraftProcessNodeChangesRequest);
  const inserts = httpJsonObject(httpJsonObject(riskMutation?.properties)?.inserts);
  const variants = httpJsonObject(inserts?.items)?.anyOf;
  if (!Array.isArray(variants)) throw new TypeError("Risk insert variants must be an array");
  const risk = variants.find(
    (variant) =>
      httpJsonObject(httpJsonObject(httpJsonObject(variant)?.properties)?.nodeType)?.const ===
      "risks",
  );
  const riskPayload = httpJsonObject(httpJsonObject(httpJsonObject(risk)?.properties)?.payload);
  const riskFields = httpJsonObject(riskPayload?.properties);
  expect(riskPayload?.required).toContain("status");
  expect(httpJsonObject(riskFields?.status)?.nullable).toBeUndefined();
  expect(httpJsonObject(riskFields?.status)?.anyOf).not.toContainEqual({ type: "null" });
  expect(httpJsonObject(riskFields?.updateType)?.anyOf).toContainEqual({ type: "null" });
  const invalid = new Set<string>();
  const missing = new Set<string>();
  let inlineDefinitions = 0;
  const visit = (value: HttpJson | undefined): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    const entry = httpJsonObject(value);
    if (entry === undefined) return;
    if (entry.$defs !== undefined) inlineDefinitions += 1;
    if (Value.Check(stringSchema, entry.$ref)) {
      if (!entry.$ref.startsWith("#/components/schemas/")) {
        invalid.add(entry.$ref);
      } else {
        const name = entry.$ref.slice("#/components/schemas/".length);
        if (!Object.hasOwn(schemas, name)) missing.add(name);
      }
    }
    for (const child of Object.values(entry)) visit(child);
  };
  visit(specification);

  expect([...invalid]).toEqual([]);
  expect([...missing]).toEqual([]);
  expect(inlineDefinitions).toBe(0);
});

test("applies one CORS policy across v1, Protocol, and v2 routes", async () => {
  const paths = [
    "/api/pls/v1/projects",
    `/api/protocol/v1/projects/${crypto.randomUUID()}/history`,
    "/api/v2/pls/projects",
  ];
  for (const path of paths) {
    const response = await application.app.handle(
      new Request(`http://localhost${path}`, {
        method: "OPTIONS",
        headers: {
          origin: "https://dashboard.example",
          "access-control-request-method": "GET",
        },
      }),
    );
    expect(response.headers.get("access-control-allow-origin")).toBe("https://dashboard.example");
  }

  const denied = await application.app.handle(
    new Request("http://localhost/api/pls/v1/projects", {
      method: "OPTIONS",
      headers: {
        origin: "https://not-allowed.example",
        "access-control-request-method": "GET",
      },
    }),
  );
  expect(denied.headers.has("access-control-allow-origin")).toBeFalse();
});
