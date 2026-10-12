import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Secret } from "@spark-workflow/http-host/process-output";
import { TemporalConnectionEnvironment } from "@spark-temporal/typescript/environment";

import { CoreWorkerEnvironment, coreWorkerTemporalConfiguration } from "../../src/temporal-env.ts";

const StorageEnvironment = {
  BUCKET_NAME: Type.String({ minLength: 1 }),
  DOC_STORE_PATH: Type.Optional(Type.String({ minLength: 1 })),
  S3_ACCESS_KEY_ID: Secret,
  S3_SECRET_ACCESS_KEY: Secret,
  S3_ENDPOINT_URL: Type.String({ minLength: 1 }),
  S3_EXTERNAL_URL: Type.String({ minLength: 1 }),
  S3_REGION: Type.String({ minLength: 1 }),
  CLAMAV_BASE_URL: Type.String({ minLength: 1 }),
};

const ScanningDisabledEnvironment = Type.Object(
  {
    ...StorageEnvironment,
    ENV: Type.String({ minLength: 1 }),
    CLAMAV_ENABLED: Type.Literal(false),
  },
  { additionalProperties: false },
);

const ScanningEnabledEnvironment = Type.Object(
  {
    ...StorageEnvironment,
    ENV: Type.String({ minLength: 1 }),
    CLAMAV_ENABLED: Type.Literal(true),
    QUARANTINE_BUCKET_NAME: Type.String({ minLength: 1 }),
    QUARANTINE_S3_ACCESS_KEY_ID: Secret,
    QUARANTINE_S3_SECRET_ACCESS_KEY: Secret,
    QUARANTINE_S3_ENDPOINT_URL: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

const WorkerEnvironment = Type.Object(
  {
    ...CoreWorkerEnvironment.properties,
    TEMPORAL_ENABLE_APPROVAL: Type.Boolean(),
    CHECKPOINT_RETENTION_PERIOD_DAYS: Type.Integer({ minimum: 1 }),
    MAX_ZIP_ENTRIES: Type.Integer({ minimum: 1 }),
    MAX_SINGLE_ENTRY_SIZE_MB: Type.Integer({ minimum: 1 }),
    MAX_ZIP_EXTRACTION_SIZE_GB: Type.Integer({ minimum: 1 }),
    MAX_COMPRESSION_RATIO: Type.Integer({ minimum: 1 }),
    MAX_ZIP_APPENDED_DATA_BYTES: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const scanningOptionalEnvironments = new Set(["local", "development", "dev"]);

const ObjectAdmissionEnvironment = Type.Object(
  { MAX_OBJECT_SIZE_MB: Type.Integer({ minimum: 1 }) },
  { additionalProperties: false },
);

export const parseMaxObjectBytes = (source: typeof process.env) =>
  Value.Parse(ObjectAdmissionEnvironment, source).MAX_OBJECT_SIZE_MB * 1_024 * 1_024;

const parseDocumentEnvironment = (source: typeof process.env) => {
  const enabled = Value.Parse(Type.Boolean(), Value.Convert(Type.Boolean(), source.CLAMAV_ENABLED));
  const input = { ...source, CLAMAV_ENABLED: enabled };
  return enabled
    ? Value.Parse(ScanningEnabledEnvironment, input)
    : Value.Parse(ScanningDisabledEnvironment, input);
};

export const parseDocumentConfiguration = (source: typeof process.env) => {
  const environment = parseDocumentEnvironment(source);
  if (!environment.CLAMAV_ENABLED && !scanningOptionalEnvironments.has(environment.ENV)) {
    throw new TypeError(
      `CLAMAV must be enabled in '${environment.ENV}' environment; scanning can only be disabled for local development`,
    );
  }
  if (
    environment.CLAMAV_ENABLED &&
    environment.S3_ENDPOINT_URL.trim().replace(/\/+$/, "") ===
      environment.QUARANTINE_S3_ENDPOINT_URL.trim().replace(/\/+$/, "") &&
    environment.BUCKET_NAME.trim() === environment.QUARANTINE_BUCKET_NAME.trim()
  ) {
    throw new TypeError(
      "Quarantine and clean storage must use a different bucket or endpoint when scanning is enabled",
    );
  }
  const cleanStorage = Object.freeze({
    bucket: environment.BUCKET_NAME,
    prefix: environment.DOC_STORE_PATH,
    privateEndpoint: environment.S3_ENDPOINT_URL,
    publicEndpoint: environment.S3_EXTERNAL_URL,
    accessKeyId: environment.S3_ACCESS_KEY_ID,
    secretAccessKey: environment.S3_SECRET_ACCESS_KEY,
    region: environment.S3_REGION,
  });
  return Object.freeze({
    maxObjectBytes: parseMaxObjectBytes(source),
    cleanStorage,
    quarantineStorage: environment.CLAMAV_ENABLED
      ? Object.freeze({
          bucket: environment.QUARANTINE_BUCKET_NAME,
          prefix: environment.DOC_STORE_PATH,
          privateEndpoint: environment.QUARANTINE_S3_ENDPOINT_URL,
          publicEndpoint: environment.S3_EXTERNAL_URL,
          accessKeyId: environment.QUARANTINE_S3_ACCESS_KEY_ID,
          secretAccessKey: environment.QUARANTINE_S3_SECRET_ACCESS_KEY,
          region: environment.S3_REGION,
        })
      : null,
    scanner: Object.freeze({
      enabled: environment.CLAMAV_ENABLED,
      baseUrl: environment.CLAMAV_BASE_URL,
    }),
  });
};

export type DocumentConfiguration = ReturnType<typeof parseDocumentConfiguration>;

export const parseDocumentCommandConfiguration = (source: typeof process.env) => {
  const environment = Value.Parse(TemporalConnectionEnvironment, source);
  return Object.freeze({
    temporalHost: environment.TEMPORAL_HOST,
    temporalNamespace: environment.TEMPORAL_NAMESPACE,
  });
};

export type DocumentCommandConfiguration = ReturnType<typeof parseDocumentCommandConfiguration>;

export const parseDocumentWorkerConfiguration = (source: typeof process.env) => {
  const environment = Value.Parse(WorkerEnvironment, source);
  return Object.freeze({
    ...coreWorkerTemporalConfiguration(environment),
    enableApproval: environment.TEMPORAL_ENABLE_APPROVAL,
    checkpointRetentionDays: environment.CHECKPOINT_RETENTION_PERIOD_DAYS,
    zipLimits: Object.freeze({
      maxEntries: environment.MAX_ZIP_ENTRIES,
      maxSingleEntryBytes: environment.MAX_SINGLE_ENTRY_SIZE_MB * 1_024 * 1_024,
      maxTotalUncompressedBytes: environment.MAX_ZIP_EXTRACTION_SIZE_GB * 1_024 * 1_024 * 1_024,
      maxCompressionRatio: environment.MAX_COMPRESSION_RATIO,
      maxAppendedDataBytes: environment.MAX_ZIP_APPENDED_DATA_BYTES,
    }),
  });
};

export type DocumentWorkerConfiguration = ReturnType<typeof parseDocumentWorkerConfiguration>;
