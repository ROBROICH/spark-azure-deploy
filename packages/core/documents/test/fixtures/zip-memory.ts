import assert from "node:assert/strict";
import { Redacted } from "effect";

import { ClamAvClient } from "../../src/scanner/clamav-client.ts";
import { S3Storage } from "../../src/storage/s3-storage.ts";
import { createDmsActivities } from "../../src/temporal/activities.ts";

const endpoint = process.argv[2];
const objectBytes = Number(process.argv[3]);
assert.ok(endpoint);
assert.ok(Number.isSafeInteger(objectBytes) && objectBytes > 0);
const storage = new S3Storage({
  bucket: "zip-fixture",
  privateEndpoint: endpoint,
  publicEndpoint: endpoint,
  accessKeyId: Redacted.make("zip-fixture"),
  secretAccessKey: Redacted.make("zip-fixture-secret"),
  region: "us-east-1",
});
const unexpected = () => assert.fail("ZIP extraction must not call database activities");
const activities = createDmsActivities({
  repository: {
    listFiles: unexpected,
    ingestFile: unexpected,
    renameFile: unexpected,
    persistZipDiff: unexpected,
    updateZipStatus: unexpected,
    updateFileStatus: unexpected,
    updateZipApprovalStatus: unexpected,
  },
  zipSourceStorage: storage,
  cleanStorage: storage,
  scanner: new ClamAvClient({ enabled: false, baseUrl: endpoint }),
  scanAndPromote: { execute: unexpected },
  config: {
    zipLimits: {
      maxEntries: 1,
      maxSingleEntryBytes: objectBytes,
      maxTotalUncompressedBytes: objectBytes,
      maxCompressionRatio: 100,
      maxAppendedDataBytes: 65536,
    },
  },
});
try {
  // RSS includes native allocator caches; measure retained ArrayBuffer bytes.
  const warmupIterations = 8;
  const measuredIterations = 14;
  let baseline = 0;
  for (let iteration = 0; iteration < warmupIterations + measuredIterations; iteration++) {
    const extraction = await activities.extractZip({
      zipFileId: "10000000-0000-4000-8000-000000000001",
      projectId: "20000000-0000-4000-8000-000000000002",
      filename: "archive.zip",
      zipPath: "archive.zip",
      fileType: "zip",
    });
    assert.ok(extraction.ok);
    const results = extraction.value;
    assert.equal(results.length, 1);
    assert.equal(results[0]?.success, true);
    Bun.gc(true);
    await Bun.sleep(20);
    Bun.gc(true);
    if (iteration === warmupIterations - 1) baseline = process.memoryUsage().arrayBuffers;
  }
  const growth = process.memoryUsage().arrayBuffers - baseline;
  assert.ok(
    growth < 128 * 1024 * 1024,
    `Extracted buffers retained ${Math.round(growth / 1024 / 1024)} MiB`,
  );
} finally {
  storage.close();
}
