import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Secret } from "@spark-workflow/http-host/process-output";
import {
  TemporalConnectionEnvironment,
  TemporalWorkerEnvironment,
} from "@spark-temporal/typescript/environment";

const TemporalPayloadStorage = Type.Object({
  bucket: Type.String({ minLength: 1 }),
  endpoint: Type.String({ minLength: 1 }),
  region: Type.String({ minLength: 1 }),
  accessKeyId: Secret,
  secretAccessKey: Secret,
});

const QueryEnvironment = Type.Object(
  {
    ...TemporalConnectionEnvironment.properties,
    TEMPORAL_PAYLOAD_STORAGE: Type.Union([TemporalPayloadStorage, Type.Null()]),
    MAX_SYSTEM_COMPLEXITY: Type.Number({ exclusiveMinimum: 0 }),
    WORKFLOW_COMPLEXITY: Type.Record(Type.String({ minLength: 1 }), Type.Number({ minimum: 0 })),
    DEFAULT_WORKFLOW_COMPLEXITY_WEIGHT: Type.Number({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const WorkerEnvironment = Type.Object(
  {
    ...TemporalWorkerEnvironment.properties,
    TEMPORAL_S3_ENDPOINT_URL: Type.Optional(Type.String({ minLength: 1 })),
    TEMPORAL_S3_ACCESS_KEY_ID: Type.Optional(Type.String({ minLength: 1 })),
    TEMPORAL_S3_SECRET_ACCESS_KEY: Type.Optional(Type.String({ minLength: 1 })),
    TEMPORAL_S3_REGION: Type.Optional(Type.String({ minLength: 1 })),
    TEMPORAL_S3_BUCKET_NAME: Type.Optional(Type.String({ minLength: 1 })),
    TEMPORAL_S3_ARCHIVAL_BUCKET_NAME: Type.Optional(Type.String({ minLength: 1 })),
    ARCHIVAL_ENABLED: Type.Boolean(),
    ARCHIVAL_WORKFLOW_ID: Type.String({ minLength: 1 }),
    ARCHIVAL_CRON: Type.String({ minLength: 1 }),
    ARCHIVAL_BATCH_SIZE: Type.Integer({ minimum: 1 }),
    ARCHIVAL_S3_PREFIX: Type.String({ minLength: 1 }),
    ARCHIVAL_ENCRYPTION_KEY: Type.Optional(Type.String({ minLength: 1 })),
    SPARK_TEMPORAL_FIXTURE_FILE: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

const WorkerStorageEnvironment = Type.Object({
  endpoint: Type.String({ minLength: 1 }),
  accessKeyId: Secret,
  secretAccessKey: Secret,
  region: Type.String({ minLength: 1 }),
  payloadBucket: Type.String({ minLength: 1 }),
  archiveBucket: Type.String({ minLength: 1 }),
  archiveEncryptionKey: Secret,
});

export function parseTemporalQueryConfiguration(source: typeof process.env) {
  const complexity = source.WORKFLOW_COMPLEXITY;
  const payloadStorage = {
    bucket: source.TEMPORAL_S3_BUCKET_NAME,
    endpoint: source.TEMPORAL_S3_ENDPOINT_URL,
    region: source.TEMPORAL_S3_REGION,
    accessKeyId: source.TEMPORAL_S3_ACCESS_KEY_ID,
    secretAccessKey: source.TEMPORAL_S3_SECRET_ACCESS_KEY,
  };
  const environment = Value.Parse(QueryEnvironment, {
    ...source,
    WORKFLOW_COMPLEXITY: complexity === undefined ? complexity : JSON.parse(complexity),
    TEMPORAL_PAYLOAD_STORAGE: Object.values(payloadStorage).every((value) => value === undefined)
      ? null
      : payloadStorage,
  });
  return Object.freeze({
    payloadStorage: environment.TEMPORAL_PAYLOAD_STORAGE,
    temporalHost: environment.TEMPORAL_HOST,
    temporalNamespace: environment.TEMPORAL_NAMESPACE,
    maxSystemComplexity: environment.MAX_SYSTEM_COMPLEXITY,
    workflowComplexity: Object.freeze(environment.WORKFLOW_COMPLEXITY),
    defaultWorkflowComplexityWeight: environment.DEFAULT_WORKFLOW_COMPLEXITY_WEIGHT,
  });
}

export type TemporalQueryConfiguration = ReturnType<typeof parseTemporalQueryConfiguration>;

export function parseTemporalJobWorkerConfiguration(source: typeof process.env) {
  const environment = Value.Parse(WorkerEnvironment, source);
  if (!environment.ARCHIVAL_ENABLED || environment.SPARK_TEMPORAL_FIXTURE_FILE !== undefined) {
    return Object.freeze({ active: false });
  }
  const storage = Value.Parse(WorkerStorageEnvironment, {
    endpoint: environment.TEMPORAL_S3_ENDPOINT_URL,
    accessKeyId: environment.TEMPORAL_S3_ACCESS_KEY_ID,
    secretAccessKey: environment.TEMPORAL_S3_SECRET_ACCESS_KEY,
    region: environment.TEMPORAL_S3_REGION,
    payloadBucket: environment.TEMPORAL_S3_BUCKET_NAME,
    archiveBucket: environment.TEMPORAL_S3_ARCHIVAL_BUCKET_NAME,
    archiveEncryptionKey: environment.ARCHIVAL_ENCRYPTION_KEY,
  });
  return Object.freeze({
    active: true,
    temporalHost: environment.TEMPORAL_HOST,
    temporalNamespace: environment.TEMPORAL_NAMESPACE,
    maxConcurrentActivities: environment.TEMPORAL_MAX_CONCURRENT_ACTIVITIES,
    maxTaskQueueActivitiesPerSecond: environment.TEMPORAL_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND,
    schedule: Object.freeze({
      workflowId: environment.ARCHIVAL_WORKFLOW_ID,
      cron: environment.ARCHIVAL_CRON,
      batchSize: environment.ARCHIVAL_BATCH_SIZE,
    }),
    payloadStorage: Object.freeze({
      bucket: storage.payloadBucket,
      endpoint: storage.endpoint,
      region: storage.region,
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
    }),
    archiveStorage: Object.freeze({
      bucket: storage.archiveBucket,
      prefix: environment.ARCHIVAL_S3_PREFIX,
      encryptionKey: storage.archiveEncryptionKey,
      endpoint: storage.endpoint,
      region: storage.region,
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
    }),
  });
}

export type TemporalJobWorkerConfiguration = ReturnType<typeof parseTemporalJobWorkerConfiguration>;
