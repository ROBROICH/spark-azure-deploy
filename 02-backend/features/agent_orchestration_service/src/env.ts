import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { parseMaxObjectBytes } from "@spark-workflow/core/documents/env";
import { parseFileUrlPolicy } from "@spark-workflow/fpp-service/url";
import { Secret } from "@spark-workflow/http-host/process-output";
import { TemporalWorkerEnvironment } from "@spark-temporal/typescript/environment";


const TemporalPayloadStorage = Type.Object({
  bucket: Type.String({ minLength: 1 }),
  endpoint: Type.String({ minLength: 1 }),
  region: Type.String({ minLength: 1 }),
  accessKeyId: Secret,
  secretAccessKey: Secret,
});

const CommandEnvironment = Type.Object(
  {
    TEMPORAL_HOST: Type.String({ minLength: 1 }),
    TEMPORAL_NAMESPACE: Type.String({ minLength: 1 }),
    TEMPORAL_PAYLOAD_STORAGE: Type.Union([TemporalPayloadStorage, Type.Null()]),
  },
  { additionalProperties: false },
);

const WorkerEnvironment = Type.Object(
  {
    ...CommandEnvironment.properties,
    ...TemporalWorkerEnvironment.properties,
    FPP_CREDENTIAL: Type.Union([
      Type.Object({
        tokenUrl: Type.String({ minLength: 1 }),
        clientId: Type.String({ minLength: 1 }),
        clientSecret: Secret,
        username: Type.String({ minLength: 1 }),
        password: Secret,
      }),
      Type.Null(),
    ]),
  },
  { additionalProperties: false },
);
type Source = Readonly<Record<string, string | undefined>>;

function fppCredential(source: Source) {
  const values = [
    source.FPP_OIDC_TOKEN_URL,
    source.FPP_CLIENT_ID,
    source.FPP_CLIENT_SECRET,
    source.FPP_USERNAME,
    source.FPP_PASSWORD,
  ];
  if (values.every((value) => value === undefined)) return null;
  return {
    tokenUrl: values[0],
    clientId: values[1],
    clientSecret: values[2],
    username: values[3],
    password: values[4],
  };
}

function payloadStorage(source: Source) {
  const values = [
    source.TEMPORAL_S3_BUCKET_NAME,
    source.TEMPORAL_S3_ENDPOINT_URL,
    source.TEMPORAL_S3_REGION,
    source.TEMPORAL_S3_ACCESS_KEY_ID,
    source.TEMPORAL_S3_SECRET_ACCESS_KEY,
  ];
  if (values.every((value) => value === undefined)) return null;
  return {
    bucket: values[0],
    endpoint: values[1],
    region: values[2],
    accessKeyId: values[3],
    secretAccessKey: values[4],
  };
}

const commandInput = (source: Source) => ({
  TEMPORAL_HOST: source.TEMPORAL_HOST,
  TEMPORAL_NAMESPACE: source.TEMPORAL_NAMESPACE,
  TEMPORAL_PAYLOAD_STORAGE: payloadStorage(source),
});

export function parseAosCommandConfiguration(source: Source) {
  const environment = Value.Parse(
    CommandEnvironment,
    Value.Convert(CommandEnvironment, commandInput(source)),
  );
  return Object.freeze({
    temporalHost: environment.TEMPORAL_HOST,
    temporalNamespace: environment.TEMPORAL_NAMESPACE,
    payloadStorage: environment.TEMPORAL_PAYLOAD_STORAGE,
  });
}

export type AosCommandConfiguration = ReturnType<typeof parseAosCommandConfiguration>;

export function parseAosWorkerConfiguration(source: Source) {
  const environment = Value.Parse(
    WorkerEnvironment,
    Value.Convert(WorkerEnvironment, {
      ...commandInput(source),
      TEMPORAL_MAX_CONCURRENT_ACTIVITIES: source.TEMPORAL_MAX_CONCURRENT_ACTIVITIES,
      TEMPORAL_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND: source.TEMPORAL_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND,
      FPP_CREDENTIAL: fppCredential(source),
    }),
  );
  return Object.freeze({
    temporalHost: environment.TEMPORAL_HOST,
    temporalNamespace: environment.TEMPORAL_NAMESPACE,
    payloadStorage: environment.TEMPORAL_PAYLOAD_STORAGE,
    maxConcurrentActivities: environment.TEMPORAL_MAX_CONCURRENT_ACTIVITIES,
    maxTaskQueueActivitiesPerSecond: environment.TEMPORAL_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND,
    fppCredential: environment.FPP_CREDENTIAL,
    fppDownloadPolicy: parseFileUrlPolicy(source),
    maxObjectBytes: parseMaxObjectBytes(source),
  });
}

export type AosWorkerConfiguration = ReturnType<typeof parseAosWorkerConfiguration>;
