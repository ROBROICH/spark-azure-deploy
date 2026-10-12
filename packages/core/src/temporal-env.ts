import { Type, type StaticDecode } from "@sinclair/typebox";
import { Secret } from "@spark-workflow/http-host/process-output";
import { TemporalWorkerEnvironment } from "@spark-temporal/typescript/environment";

export const CoreWorkerEnvironment = Type.Object(
  {
    ...TemporalWorkerEnvironment.properties,
    TEMPORAL_S3_BUCKET_NAME: Type.String({ minLength: 1 }),
    TEMPORAL_S3_ENDPOINT_URL: Type.String({ minLength: 1 }),
    TEMPORAL_S3_REGION: Type.String({ minLength: 1 }),
    TEMPORAL_S3_ACCESS_KEY_ID: Secret,
    TEMPORAL_S3_SECRET_ACCESS_KEY: Secret,
  },
  { additionalProperties: false },
);

export const coreWorkerTemporalConfiguration = (
  environment: StaticDecode<typeof CoreWorkerEnvironment>,
) => ({
  temporalHost: environment.TEMPORAL_HOST,
  temporalNamespace: environment.TEMPORAL_NAMESPACE,
  maxConcurrentActivities: environment.TEMPORAL_MAX_CONCURRENT_ACTIVITIES,
  maxTaskQueueActivitiesPerSecond: environment.TEMPORAL_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND,
  payloadStorage: Object.freeze({
    bucket: environment.TEMPORAL_S3_BUCKET_NAME,
    endpoint: environment.TEMPORAL_S3_ENDPOINT_URL,
    region: environment.TEMPORAL_S3_REGION,
    accessKeyId: environment.TEMPORAL_S3_ACCESS_KEY_ID,
    secretAccessKey: environment.TEMPORAL_S3_SECRET_ACCESS_KEY,
  }),
});
