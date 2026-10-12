import assert from "node:assert/strict";
import { Redacted } from "effect";

import { S3Storage } from "../../src/storage/s3-storage.ts";
import { computeFileDiff } from "../../src/temporal/diff.ts";

const endpoint = process.argv[2];
assert.ok(endpoint, "The memory worker requires its fixture server URL");
const storage = new S3Storage({
  bucket: "diff-fixture",
  privateEndpoint: endpoint,
  publicEndpoint: endpoint,
  accessKeyId: Redacted.make("diff-fixture"),
  secretAccessKey: Redacted.make("diff-fixture-secret"),
  region: "us-east-1",
});
let sampler: NodeJS.Timeout | undefined;
try {
  await storage.head("source/document.pdf");
  Bun.gc(true);
  const baseline = process.memoryUsage.rss();
  let peak = baseline;
  // Sample the isolated process's actual RSS while the network transfer is active.
  sampler = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage.rss());
  }, 5);
  const diff = await computeFileDiff(
    {
      projectId: "20000000-0000-4000-8000-000000000002",
      zipFileId: "10000000-0000-4000-8000-000000000001",
      projectVersion: 1,
      entryFileType: "document",
      files: [
        {
          success: true,
          filename: "document.pdf",
          action: "UNZIP",
          fileId: null,
          bucketPath: "source/document.pdf",
          errorCode: null,
          errorMessage: null,
        },
      ],
    },
    [
      {
        id: "50000000-0000-4000-8000-000000000005",
        filename: "document.pdf",
        bucketPath: "target/document.pdf",
      },
    ],
    storage,
  );
  peak = Math.max(peak, process.memoryUsage.rss());
  // Independently calculated SHA-256 of the 256 MiB zero-filled object.
  assert.equal(
    diff.unchanged[0]?.sha,
    "a6d72ac7690f53be6ae46ba88506bd97302a093f7108472bd9efc3cefda06484",
  );
  const growth = peak - baseline;
  console.log(
    `Hashing two 256 MiB objects: peak RSS growth ${Math.round(growth / 1024 / 1024)} MiB`,
  );
  assert.ok(growth < 192 * 1024 * 1024, "Hashing must not retain a whole 256 MiB object in memory");
} finally {
  clearInterval(sampler);
  storage.close();
}
