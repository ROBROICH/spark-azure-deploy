import { describe, expect, test } from "bun:test";
import { Redacted } from "effect";

import { S3Storage } from "../src/storage/s3-storage.ts";

const storage = (endpoint: string) =>
  new S3Storage({
    bucket: "probe-bucket",
    prefix: "",
    privateEndpoint: endpoint,
    publicEndpoint: endpoint,
    accessKeyId: Redacted.make("probe-key"),
    secretAccessKey: Redacted.make("probe-secret"),
    region: "eu-west-1",
  });

describe("Document Management storage readiness boundary", () => {
  test("distinguishes a present bucket from S3 response failures", async () => {
    let status = 200;
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Response(null, { status }),
    });
    const client = storage(server.url.origin);
    try {
      expect(await client.bucketExists()).toBeTrue();
      status = 404;
      expect(await client.bucketExists()).toBeFalse();
      status = 403;
      expect(await client.bucketExists()).toBeFalse();
      status = 503;
      expect(await client.bucketExists()).toBeFalse();
    } finally {
      client.close();
      await server.stop(true);
    }
  });

  test("preserves transport failures for the probe's storage-unreachable branch", async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const endpoint = server.url.origin;
    await server.stop(true);
    const client = storage(endpoint);
    try {
      const failure = await client.bucketExists().then(
        () => undefined,
        (error) => error,
      );
      expect(failure).toBeDefined();
    } finally {
      client.close();
    }
  });
});
