import { createHash, randomUUID, timingSafeEqual } from "node:crypto";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Payload, PayloadCodec } from "@temporalio/common";
import { temporal } from "@temporalio/proto";
import { Redacted } from "effect";

const MAX_PAYLOAD_SIZE = 100 * 1024;
const S3_REFERENCE_ENCODING = "binary/s3-reference";
const S3_REFERENCE_VERSION = "1";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export interface S3PayloadConversionConfig {
  readonly bucket: string;
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: Redacted.Redacted<string>;
  readonly secretAccessKey: Redacted.Redacted<string>;
}

function required(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new TypeError(`S3 payload conversion requires ${name}`);
  }
  return value;
}

function metadataText(payload: Payload, name: string): string | undefined {
  const value = payload.metadata?.[name];
  return value === undefined ? undefined : decoder.decode(value);
}

function requiredMetadata(payload: Payload, name: string): string {
  const value = metadataText(payload, name);
  if (value === undefined || value.length === 0) {
    throw new TypeError(`S3 reference payload is missing ${name}`);
  }
  return value;
}

function verifyChecksum(expected: string, data: Uint8Array): void {
  if (!/^[0-9a-f]{64}$/.test(expected)) {
    throw new TypeError("S3 reference payload has invalid s3-sha256 metadata");
  }
  const actual = createHash("sha256").update(data).digest("hex");
  if (!timingSafeEqual(Buffer.from(expected, "ascii"), Buffer.from(actual, "ascii"))) {
    throw new Error("S3 reference payload checksum mismatch");
  }
}

export function createS3PayloadCodec(
  config: S3PayloadConversionConfig,
): PayloadCodec & { close(): Promise<void> } {
  const bucket = required(config.bucket, "bucket");
  const client = new S3Client({
    endpoint: required(config.endpoint, "endpoint"),
    region: required(config.region, "region"),
    forcePathStyle: true,
    credentials: {
      accessKeyId: required(Redacted.value(config.accessKeyId), "accessKeyId"),
      secretAccessKey: required(Redacted.value(config.secretAccessKey), "secretAccessKey"),
    },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  let closed = false;

  return Object.freeze({
    encode(payloads: Payload[]) {
      return Promise.all(
        payloads.map(async (payload) => {
          const serialized = temporal.api.common.v1.Payload.encode(payload).finish();
          if (serialized.byteLength <= MAX_PAYLOAD_SIZE) return payload;

          const key = `payloads/${randomUUID()}`;
          await client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: serialized,
              ContentType: "application/octet-stream",
            }),
          );
          return {
            metadata: {
              encoding: encoder.encode(S3_REFERENCE_ENCODING),
              "s3-key": encoder.encode(key),
              "s3-reference-version": encoder.encode(S3_REFERENCE_VERSION),
              "s3-sha256": encoder.encode(createHash("sha256").update(serialized).digest("hex")),
            },
            data: new Uint8Array(),
          } satisfies Payload;
        }),
      );
    },

    decode(payloads: Payload[]) {
      return Promise.all(
        payloads.map(async (payload) => {
          if (metadataText(payload, "encoding") !== S3_REFERENCE_ENCODING) {
            return payload;
          }
          const version = metadataText(payload, "s3-reference-version") ?? "0";
          if (version !== "0" && version !== S3_REFERENCE_VERSION) {
            throw new TypeError(`Unsupported S3 reference payload version: ${version}`);
          }
          const response = await client.send(
            new GetObjectCommand({
              Bucket: bucket,
              Key: requiredMetadata(payload, "s3-key"),
            }),
          );
          if (response.Body === undefined) {
            throw new TypeError("S3 payload object did not contain a readable body");
          }
          const serialized = await response.Body.transformToByteArray();
          if (version === S3_REFERENCE_VERSION) {
            verifyChecksum(requiredMetadata(payload, "s3-sha256"), serialized);
          }
          return temporal.api.common.v1.Payload.decode(serialized);
        }),
      );
    },

    async close() {
      if (closed) return;
      closed = true;
      client.destroy();
    },
  });
}
