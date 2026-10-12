import { describe, expect, test } from "bun:test";
import { Redacted } from "effect";

import { DmsValidationError } from "../src/errors.ts";
import {
  S3Storage,
  StorageConflictError,
  StorageNotFoundError,
} from "../src/storage/s3-storage.ts";

const realBoundary = process.env.DMS_BOUNDARY_PROFILE === "real" ? describe : describe.skip;
const exactBytes = new TextEncoder().encode(
  "%PDF-1.4\nDMS TypeScript storage boundary\0binary\n%%EOF\n",
);

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set by the real DMS boundary profile`);
  return value;
};

const storage = (
  bucket: string,
  quarantine: boolean,
  publicEndpoint = required("S3_EXTERNAL_URL"),
): S3Storage =>
  new S3Storage({
    bucket,
    prefix: required("DOC_STORE_PATH"),
    privateEndpoint: quarantine
      ? required("QUARANTINE_S3_ENDPOINT_URL")
      : required("S3_ENDPOINT_URL"),
    publicEndpoint,
    accessKeyId: Redacted.make(
      quarantine ? required("QUARANTINE_S3_ACCESS_KEY_ID") : required("S3_ACCESS_KEY_ID"),
    ),
    secretAccessKey: Redacted.make(
      quarantine ? required("QUARANTINE_S3_SECRET_ACCESS_KEY") : required("S3_SECRET_ACCESS_KEY"),
    ),
    region: required("S3_REGION"),
  });

const deletePrefix = async (client: S3Storage, prefix: string): Promise<void> => {
  for (const name of await client.list(prefix)) await client.delete(name);
};

const exercise = async (client: S3Storage, scenario: string): Promise<void> => {
  const signed = `${scenario}/signed/report.pdf`;
  const copied = `${scenario}/copies/report.pdf`;
  const overwritten = `${scenario}/copies/overwrite.pdf`;
  expect(await client.exists(signed)).toBeFalse();

  const uploadUrl = await client.presignUpload(signed, {
    expiresInSeconds: 120,
    contentType: "application/pdf",
  });
  const uploadBytes = Uint8Array.from(exactBytes);
  const rejected = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "text/plain" },
    body: uploadBytes.buffer,
  });
  expect(rejected.status).toBe(403);
  const uploaded = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "content-type": "application/pdf" },
    body: uploadBytes.buffer,
  });
  expect(uploaded.ok).toBeTrue();

  expect((await client.download(signed, exactBytes.byteLength)).bytes).toEqual(exactBytes);
  expect(
    await client.download(signed, exactBytes.byteLength - 1).catch((error) => error),
  ).toMatchObject({ code: DmsValidationError.code });
  expect(await client.contentType(signed)).toBe("application/pdf");

  await client.upload(copied, exactBytes, {
    contentType: "application/pdf",
    metadata: { scenario, reviewed: "true" },
  });
  expect((await client.head(copied)).metadata).toEqual({ scenario, reviewed: "true" });
  await client.updateMetadata(copied, { promoted: "true" });
  expect((await client.head(copied)).metadata).toEqual({
    scenario,
    reviewed: "true",
    promoted: "true",
  });

  await client.copy(copied, overwritten);
  expect((await client.download(overwritten, exactBytes.byteLength)).bytes).toEqual(exactBytes);
  expect((await client.head(overwritten)).metadata).toEqual({
    scenario,
    reviewed: "true",
    promoted: "true",
  });
  expect(await client.copy(signed, overwritten).catch((error) => error)).toMatchObject({
    code: StorageConflictError.code,
  });
  await client.copy(signed, overwritten, { overwrite: true });
  expect(await client.list(scenario)).toEqual([copied, overwritten, signed].sort());

  const inline = await client.presignDownload(signed, {
    expiresInSeconds: 120,
    contentType: "application/pdf",
    inline: true,
  });
  const downloaded = await fetch(inline);
  expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(exactBytes);
  expect(downloaded.headers.get("content-type")).toBe("application/pdf");
  expect(downloaded.headers.get("content-disposition")).toBe('inline; filename="report.pdf"');

  await client.delete(copied);
  expect(await client.delete(copied).catch((error) => error)).toMatchObject({
    code: StorageNotFoundError.code,
  });
  expect(
    await client.download(`${scenario}/missing.pdf`, exactBytes.byteLength).catch((error) => error),
  ).toMatchObject({ code: StorageNotFoundError.code });
};

realBoundary("real DMS TypeScript clean/quarantine storage capability", () => {
  for (const [label, bucketName, quarantine] of [
    ["clean", "BUCKET_NAME", false],
    ["quarantine", "QUARANTINE_BUCKET_NAME", true],
  ] as const) {
    test(`${label} storage preserves bytes, metadata, prefix, copy, presign and lifecycle`, async () => {
      const client = storage(required(bucketName), quarantine);
      const scenario = `ts-storage-${label}-${crypto.randomUUID()}`;
      try {
        await client.ready();
        await exercise(client, scenario);
      } finally {
        await deletePrefix(client, scenario);
        client.close();
      }
      await client.ready();
      client.close();
    });

    test(`${label} internal signing transfers bytes without the browser endpoint`, async () => {
      const browserEndpoint = "https://browser-storage.invalid";
      const privateEndpoint = required(
        quarantine ? "QUARANTINE_S3_ENDPOINT_URL" : "S3_ENDPOINT_URL",
      );
      const client = storage(required(bucketName), quarantine, browserEndpoint);
      const scenario = `ts-internal-storage-${label}-${crypto.randomUUID()}`;
      const filename = `${scenario}/report.pdf`;
      try {
        await client.ready();
        const publicUpload = await client.presignUpload(filename, {
          expiresInSeconds: 120,
          contentType: "application/pdf",
        });
        expect(new URL(publicUpload).origin).toBe(browserEndpoint);
        const uploadUrl = await client.presignUpload(filename, {
          expiresInSeconds: 120,
          contentType: "application/pdf",
          internal: true,
        });
        expect(new URL(uploadUrl).origin).toBe(new URL(privateEndpoint).origin);
        const rejected = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "content-type": "text/plain" },
          body: Uint8Array.from(exactBytes).buffer,
        });
        expect(rejected.status).toBe(403);
        const uploaded = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "content-type": "application/pdf" },
          body: Uint8Array.from(exactBytes).buffer,
        });
        expect(uploaded.ok).toBeTrue();

        const publicDownload = await client.presignDownload(filename, {
          expiresInSeconds: 120,
        });
        expect(new URL(publicDownload).origin).toBe(browserEndpoint);
        const downloadUrl = await client.presignDownload(filename, {
          expiresInSeconds: 120,
          internal: true,
        });
        expect(new URL(downloadUrl).origin).toBe(new URL(privateEndpoint).origin);
        const downloaded = await fetch(downloadUrl);
        expect(downloaded.ok).toBeTrue();
        expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(exactBytes);
        expect(downloaded.headers.get("content-type")).toBe("application/pdf");
      } finally {
        try {
          await deletePrefix(client, scenario);
        } finally {
          client.close();
        }
      }
    });
  }
});
