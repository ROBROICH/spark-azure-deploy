import { describe, expect, test } from "bun:test";

import { parseDocumentConfiguration, parseDocumentWorkerConfiguration } from "../src/env.ts";

const enabledEnvironment = {
  ENV: "production",
  BUCKET_NAME: "clean",
  S3_ACCESS_KEY_ID: "unused",
  S3_SECRET_ACCESS_KEY: "unused",
  S3_ENDPOINT_URL: "http://storage.invalid:9000",
  S3_EXTERNAL_URL: "http://storage.invalid:9000",
  S3_REGION: "eu-west-1",
  CLAMAV_ENABLED: "true",
  CLAMAV_BASE_URL: "http://127.0.0.1:3310",
  QUARANTINE_BUCKET_NAME: "quarantine",
  QUARANTINE_S3_ACCESS_KEY_ID: "quarantine-key",
  QUARANTINE_S3_SECRET_ACCESS_KEY: "quarantine-secret",
  QUARANTINE_S3_ENDPOINT_URL: "http://quarantine.invalid:9000",
  MAX_OBJECT_SIZE_MB: "1024",
} satisfies Record<string, string | undefined>;

const input = (overrides: Record<string, string | undefined> = {}) => ({
  ...enabledEnvironment,
  ...overrides,
});

const workerEnvironment = {
  TEMPORAL_HOST: "127.0.0.1:7233",
  TEMPORAL_NAMESPACE: "default",
  TEMPORAL_TASK_QUEUE: "document-management",
  TEMPORAL_MAX_CONCURRENT_ACTIVITIES: "10",
  TEMPORAL_MAX_TASK_QUEUE_ACTIVITIES_PER_SECOND: "100",
  TEMPORAL_ENABLE_APPROVAL: "false",
  TEMPORAL_S3_BUCKET_NAME: "temporal-payloads",
  TEMPORAL_S3_ENDPOINT_URL: "http://storage.invalid:9000",
  TEMPORAL_S3_REGION: "eu-west-1",
  TEMPORAL_S3_ACCESS_KEY_ID: "temporal-key",
  TEMPORAL_S3_SECRET_ACCESS_KEY: "temporal-secret",
  CHECKPOINT_RETENTION_PERIOD_DAYS: "60",
  MAX_ZIP_ENTRIES: "1000",
  MAX_SINGLE_ENTRY_SIZE_MB: "1024",
  MAX_ZIP_EXTRACTION_SIZE_GB: "10",
  MAX_COMPRESSION_RATIO: "100",
  MAX_ZIP_APPENDED_DATA_BYTES: "65536",
} satisfies Record<string, string | undefined>;

describe("DMS ClamAV startup environment", () => {
  for (const environment of ["local", "development", "dev"] as const) {
    test(`allows scanning disabled in ${environment} when CLAMAV_ENABLED is false`, () => {
      const parsed = parseDocumentConfiguration(
        input({ ENV: environment, CLAMAV_ENABLED: "false" }),
      );

      expect(parsed.scanner.enabled).toBe(false);
      expect(parsed.quarantineStorage).toBeNull();
    });

    describe("DMS worker ZIP limits", () => {
      test("parses the configured appended-data tolerance", () => {
        expect(
          parseDocumentWorkerConfiguration(workerEnvironment).zipLimits.maxAppendedDataBytes,
        ).toBe(65536);
      });

      test("allows appended-data tolerance to be disabled", () => {
        expect(
          parseDocumentWorkerConfiguration({
            ...workerEnvironment,
            MAX_ZIP_APPENDED_DATA_BYTES: "0",
          }).zipLimits.maxAppendedDataBytes,
        ).toBe(0);
      });

      test("rejects negative appended-data tolerance", () => {
        expect(() =>
          parseDocumentWorkerConfiguration({
            ...workerEnvironment,
            MAX_ZIP_APPENDED_DATA_BYTES: "-1",
          }),
        ).toThrow("Expected");
      });
    });
  }

  for (const environment of ["production", "staging", "testing", "custom-env"] as const) {
    test(`rejects scanning disabled in ${environment} when CLAMAV_ENABLED is false`, () => {
      expect(() =>
        parseDocumentConfiguration(input({ ENV: environment, CLAMAV_ENABLED: "false" })),
      ).toThrow(`CLAMAV must be enabled in '${environment}' environment`);
    });
  }

  test("requires CLAMAV_ENABLED", () => {
    expect(() => parseDocumentConfiguration(input({ CLAMAV_ENABLED: undefined }))).toThrow(
      "Expected",
    );
  });

  for (const environment of [undefined, ""] as const) {
    test(`requires ENV (${JSON.stringify(environment)})`, () => {
      expect(() => parseDocumentConfiguration(input({ ENV: environment }))).toThrow();
    });
  }

  for (const configuredValue of ["tru", "yes", ""] as const) {
    test(`rejects invalid CLAMAV_ENABLED=${JSON.stringify(configuredValue)}`, () => {
      expect(() =>
        parseDocumentConfiguration(input({ ENV: "dev", CLAMAV_ENABLED: configuredValue })),
      ).toThrow("Expected");
    });
  }

  for (const setting of [
    "QUARANTINE_BUCKET_NAME",
    "QUARANTINE_S3_ACCESS_KEY_ID",
    "QUARANTINE_S3_SECRET_ACCESS_KEY",
    "QUARANTINE_S3_ENDPOINT_URL",
  ] as const) {
    for (const configuredValue of [undefined, ""] as const) {
      test(`requires nonempty ${setting} when scanning is enabled (${JSON.stringify(configuredValue)})`, () => {
        expect(() => parseDocumentConfiguration(input({ [setting]: configuredValue }))).toThrow();
      });
    }
  }

  test("allows separate buckets on the same storage endpoint", () => {
    const parsed = parseDocumentConfiguration(
      input({
        BUCKET_NAME: "clean",
        QUARANTINE_BUCKET_NAME: "quarantine",
        QUARANTINE_S3_ENDPOINT_URL: "http://storage.invalid:9000/",
      }),
    );

    expect(parsed.quarantineStorage?.bucket).toBe("quarantine");
    expect(parsed.quarantineStorage?.privateEndpoint).toBe("http://storage.invalid:9000/");
  });

  test("allows the same bucket name on a separate quarantine endpoint", () => {
    const parsed = parseDocumentConfiguration(
      input({
        BUCKET_NAME: "documents",
        QUARANTINE_BUCKET_NAME: "documents",
        S3_ENDPOINT_URL: "http://clean.invalid:9000",
        QUARANTINE_S3_ENDPOINT_URL: "http://quarantine.invalid:9000",
      }),
    );

    expect(parsed.quarantineStorage?.bucket).toBe("documents");
    expect(parsed.cleanStorage.privateEndpoint).not.toBe(parsed.quarantineStorage?.privateEndpoint);
  });

  test("rejects the same clean and quarantine endpoint and bucket", () => {
    expect(() =>
      parseDocumentConfiguration(
        input({
          BUCKET_NAME: "documents",
          QUARANTINE_BUCKET_NAME: " documents ",
          S3_ENDPOINT_URL: "http://storage.invalid:9000",
          QUARANTINE_S3_ENDPOINT_URL: "http://storage.invalid:9000/",
        }),
      ),
    ).toThrow("Quarantine and clean storage must use a different bucket or endpoint");
  });
});

describe("DMS worker Temporal concurrency", () => {
  test("rejects a fractional number of concurrent activities", () => {
    expect(() =>
      parseDocumentWorkerConfiguration({
        ...workerEnvironment,
        TEMPORAL_MAX_CONCURRENT_ACTIVITIES: "1.5",
      }),
    ).toThrow("Expected");
  });

  test("passes a whole number of concurrent activities to the worker", () => {
    expect(
      parseDocumentWorkerConfiguration({
        ...workerEnvironment,
        TEMPORAL_MAX_CONCURRENT_ACTIVITIES: "4",
      }).maxConcurrentActivities,
    ).toBe(4);
  });

  test("rejects fewer than one concurrent activity", () => {
    expect(() =>
      parseDocumentWorkerConfiguration({
        ...workerEnvironment,
        TEMPORAL_MAX_CONCURRENT_ACTIVITIES: "0.5",
      }),
    ).toThrow("Expected");
  });
});
