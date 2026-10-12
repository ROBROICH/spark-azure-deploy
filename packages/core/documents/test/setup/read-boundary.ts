import { afterAll } from "bun:test";

import readFixture from "../../fixtures/read-scenarios.json";
import {
  assertStorageFailureFixtureComplete,
  createStorageFailureFixture,
  type StorageFailureFixture,
} from "../../scripts/storage-failure-fake.ts";

let storageBoundary: StorageFailureFixture | undefined;

const readTargetConfigured =
  process.env.DMS_BASE_URL !== undefined || process.env.DMS_STORAGE_FAILURE_BASE_URL !== undefined;

if (readTargetConfigured) {
  if (
    process.env.DMS_BASE_URL === undefined ||
    process.env.DMS_STORAGE_FAILURE_BASE_URL === undefined
  ) {
    throw new Error(
      "DMS_BASE_URL and DMS_STORAGE_FAILURE_BASE_URL must both be set for the read suite",
    );
  }

  const storagePort = Number(process.env.DMS_STORAGE_FAILURE_FAKE_PORT);
  if (!Number.isInteger(storagePort) || storagePort < 1 || storagePort > 65_535) {
    throw new Error("DMS storage-denial fake port must be a fixed TCP port");
  }

  const storagePath = `/${process.env.BUCKET_NAME ?? "dms-clean-4306"}/${process.env.DOC_STORE_PATH ?? "qualification"}/documents/${readFixture.projects.other.id}/v1/${readFixture.uploads.freshFilename}`;
  const storage = createStorageFailureFixture(storagePath);
  storageBoundary = storage;
  const storageServer = Bun.serve({
    hostname: "127.0.0.1",
    port: storagePort,
    fetch: (request) => storage.respond(request),
  });

  afterAll(async () => {
    await storageServer.stop(true);
    assertStorageFailureFixtureComplete(storage);
    console.log("Document Management storage-denial fixture was consumed exactly");
  });
}

export function storageFailureCallCount(): number {
  if (storageBoundary === undefined) {
    throw new Error("Document Management storage-denial suite boundary is not active");
  }
  return storageBoundary.callCount();
}
