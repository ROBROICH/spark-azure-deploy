import { describe, expect, test } from "bun:test";

import { parseTemporalJobWorkerConfiguration } from "../src/env.ts";

const liveEnvironment = {
  TEMPORAL_HOST: "temporal.invalid:7233",
  TEMPORAL_NAMESPACE: "testing",
  TEMPORAL_MAX_CONCURRENT_ACTIVITIES: "2",
  TEMPORAL_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND: "1.5",
  TEMPORAL_S3_ENDPOINT_URL: "http://s3.invalid",
  TEMPORAL_S3_ACCESS_KEY_ID: "access",
  TEMPORAL_S3_SECRET_ACCESS_KEY: "secret",
  TEMPORAL_S3_REGION: "eu-central-1",
  TEMPORAL_S3_BUCKET_NAME: "payloads",
  TEMPORAL_S3_ARCHIVAL_BUCKET_NAME: "histories",
  ARCHIVAL_ENABLED: "true",
  ARCHIVAL_WORKFLOW_ID: "weekly-history",
  ARCHIVAL_CRON: "0 0 * * 0",
  ARCHIVAL_BATCH_SIZE: "120",
  ARCHIVAL_S3_PREFIX: "/temporal-history/",
  ARCHIVAL_ENCRYPTION_KEY: "fernet-key",
};

describe("Temporal Job worker bootstrap", () => {
  test("parses integer and fractional worker limits", () => {
    expect(parseTemporalJobWorkerConfiguration(liveEnvironment)).toMatchObject({
      maxConcurrentActivities: 2,
      maxTaskQueueActivitiesPerSecond: 1.5,
    });
  });

  test("refuses active archival without an encryption key", () => {
    expect(() =>
      parseTemporalJobWorkerConfiguration({
        ...liveEnvironment,
        ARCHIVAL_ENCRYPTION_KEY: undefined,
      }),
    ).toThrow(
      expect.objectContaining({
        error: expect.objectContaining({ path: "/archiveEncryptionKey" }),
      }),
    );
  });
});
