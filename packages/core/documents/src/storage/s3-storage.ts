import { Readable } from "node:stream";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type GetObjectCommandOutput,
  type HeadObjectOutput,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { EvlogError } from "evlog";
import { Redacted } from "effect";

import { DmsValidationError, dmsErrors } from "../errors.ts";

export interface S3StorageConfig {
  readonly bucket: string;
  readonly prefix?: string;
  readonly privateEndpoint: string;
  readonly publicEndpoint: string;
  readonly accessKeyId: Redacted.Redacted<string>;
  readonly secretAccessKey: Redacted.Redacted<string>;
  readonly region: string;
}

export interface StoredObject {
  readonly bytes: Uint8Array;
  readonly contentType: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface StoredObjectMetadata {
  readonly contentLength: number | null;
  readonly contentType: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

export const StorageNotFoundError = dmsErrors.STORAGE_NOT_FOUND;
export const StorageConflictError = dmsErrors.STORAGE_CONFLICT;

const missingS3Names = new Set(["NoSuchKey", "NotFound", "NoSuchBucket"]);

const isMissing = (error: Error): boolean => missingS3Names.has(error.name);

const normalizePrefix = (value: string | undefined): string =>
  (value ?? "").replace(/^\/+|\/+$/g, "");
const normalizeDocumentName = (value: string): string => value.replace(/^\/+/, "");

const copySource = (bucket: string, key: string): string =>
  [bucket, ...key.split("/")].map((part) => encodeURIComponent(part)).join("/");

const asMetadata = (metadata: Readonly<Record<string, string>> | undefined) => ({ ...metadata });

export class S3Storage {
  private privateClient: S3Client | undefined;
  private publicClient: S3Client | undefined;
  private fileClient: Bun.S3Client | undefined;

  constructor(readonly config: S3StorageConfig) {
    if (!config.bucket.trim()) throw new Error("S3 bucket must not be empty");
  }

  private clientConfig(endpoint: string): S3ClientConfig {
    return {
      endpoint,
      region: this.config.region,
      forcePathStyle: true,
      maxAttempts: 1,
      credentials: {
        accessKeyId: Redacted.value(this.config.accessKeyId),
        secretAccessKey: Redacted.value(this.config.secretAccessKey),
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    };
  }

  private clients() {
    this.privateClient ??= new S3Client(this.clientConfig(this.config.privateEndpoint));
    this.publicClient ??= new S3Client(this.clientConfig(this.config.publicEndpoint));
    return { privateClient: this.privateClient, publicClient: this.publicClient };
  }

  private files(): Bun.S3Client {
    this.fileClient ??= new Bun.S3Client({
      accessKeyId: Redacted.value(this.config.accessKeyId),
      secretAccessKey: Redacted.value(this.config.secretAccessKey),
      bucket: this.config.bucket,
      endpoint: this.config.privateEndpoint,
      region: this.config.region,
    });
    return this.fileClient;
  }

  key(documentName: string): string {
    const prefix = normalizePrefix(this.config.prefix);
    const name = normalizeDocumentName(documentName);
    return prefix === "" ? name : `${prefix}/${name}`;
  }

  async ready(): Promise<void> {
    await this.clients().privateClient.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
  }

  async bucketExists(): Promise<boolean> {
    try {
      await this.ready();
      return true;
    } catch (error) {
      if (error instanceof S3ServiceException) return false;
      throw error;
    }
  }

  async head(documentName: string): Promise<StoredObjectMetadata> {
    let result: HeadObjectOutput;
    try {
      result = await this.clients().privateClient.send(
        new HeadObjectCommand({ Bucket: this.config.bucket, Key: this.key(documentName) }),
      );
    } catch (error) {
      if (error instanceof Error && isMissing(error)) {
        throw StorageNotFoundError({ message: `Document '${documentName}' not found` });
      }
      throw error;
    }
    return {
      contentLength: result.ContentLength ?? null,
      contentType: result.ContentType ?? null,
      metadata: asMetadata(result.Metadata),
    };
  }

  async exists(documentName: string): Promise<boolean> {
    try {
      await this.head(documentName);
      return true;
    } catch (error) {
      if (EvlogError.isEvlogError(error) && error.code === StorageNotFoundError.code) {
        return false;
      }
      throw error;
    }
  }

  async contentType(documentName: string): Promise<string> {
    const contentType = (await this.head(documentName)).contentType;
    if (!contentType) throw new Error(`Object '${documentName}' does not have a MIME type set`);
    return contentType;
  }

  file(documentName: string): Bun.S3File {
    return this.files().file(this.key(documentName));
  }

  async download(documentName: string, maxBytes: number): Promise<StoredObject> {
    let output: GetObjectCommandOutput;
    try {
      output = await this.clients().privateClient.send(
        new GetObjectCommand({ Bucket: this.config.bucket, Key: this.key(documentName) }),
      );
    } catch (error) {
      if (error instanceof Error && isMissing(error)) {
        throw StorageNotFoundError({ message: `Document '${documentName}' not found` });
      }
      throw error;
    }
    if (output.ContentLength === undefined || output.ContentLength > maxBytes) {
      await output.Body?.transformToWebStream().cancel();
      throw DmsValidationError({
        message: `Stored file exceeds the maximum size of ${maxBytes} bytes`,
        internal: { documentName, contentLength: output.ContentLength ?? null },
      });
    }
    return {
      bytes: (await output.Body?.transformToByteArray()) ?? new Uint8Array(),
      contentType: output.ContentType ?? null,
      metadata: asMetadata(output.Metadata),
    };
  }

  async upload(
    documentName: string,
    bytes: Uint8Array,
    options: {
      readonly overwrite?: boolean;
      readonly contentType?: string;
      readonly metadata?: Readonly<Record<string, string>>;
    } = {},
  ): Promise<void> {
    const digest = options.metadata?.sha256;
    const verifiedDigest =
      digest !== undefined && digest === new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
    const matchesUpload = (existing: StoredObjectMetadata): boolean =>
      verifiedDigest &&
      existing.contentLength === bytes.byteLength &&
      Object.entries(options.metadata ?? {}).every(
        ([name, value]) => existing.metadata[name] === value,
      );
    if (!options.overwrite && (await this.exists(documentName))) {
      if (matchesUpload(await this.head(documentName))) return;
      throw StorageConflictError({ message: `Document '${documentName}' exists` });
    }
    try {
      await this.clients().privateClient.send(
        new PutObjectCommand({
          Bucket: this.config.bucket,
          Key: this.key(documentName),
          Body: bytes,
          ContentType: options.contentType,
          Metadata: options.metadata,
          IfNoneMatch: options.overwrite ? undefined : "*",
        }),
      );
    } catch (error) {
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412) {
        if (matchesUpload(await this.head(documentName))) return;
        throw StorageConflictError({ message: `Document '${documentName}' exists`, cause: error });
      }
      throw error;
    }
  }

  async delete(documentName: string): Promise<void> {
    if (!(await this.exists(documentName))) {
      throw StorageNotFoundError({ message: `Document '${documentName}' not found` });
    }
    await this.clients().privateClient.send(
      new DeleteObjectCommand({ Bucket: this.config.bucket, Key: this.key(documentName) }),
    );
  }

  async copy(
    sourceName: string,
    destinationName: string,
    options: { readonly overwrite?: boolean; readonly expectedSha256?: string } = {},
  ): Promise<void> {
    await this.copyFrom(this, sourceName, destinationName, options);
  }

  async copyFrom(
    source: S3Storage,
    sourceName: string,
    destinationName: string,
    options: { readonly overwrite?: boolean; readonly expectedSha256?: string } = {},
  ): Promise<void> {
    if (!options.overwrite) {
      if (await this.exists(destinationName)) {
        if (
          options.expectedSha256 !== undefined &&
          (await this.head(destinationName)).metadata.sha256 === options.expectedSha256
        )
          return;
        throw StorageConflictError({ message: `Destination '${destinationName}' exists` });
      }
      let object: GetObjectCommandOutput;
      try {
        object = await source.clients().privateClient.send(
          new GetObjectCommand({
            Bucket: source.config.bucket,
            Key: source.key(sourceName),
          }),
        );
      } catch (error) {
        if (error instanceof Error && isMissing(error))
          throw StorageNotFoundError({
            message: `Document '${sourceName}' not found`,
            cause: error,
          });
        throw error;
      }
      if (object.Body === undefined)
        throw StorageNotFoundError({ message: `Document '${sourceName}' has no body` });
      const body = object.Body;
      try {
        if (
          options.expectedSha256 !== undefined &&
          object.Metadata?.sha256 !== undefined &&
          object.Metadata.sha256 !== options.expectedSha256
        ) {
          throw StorageConflictError({
            message: `Source '${sourceName}' does not match the approved digest`,
          });
        }
        await this.clients().privateClient.send(
          new PutObjectCommand({
            Bucket: this.config.bucket,
            Key: this.key(destinationName),
            Body: body,
            ContentLength: object.ContentLength,
            ContentType: object.ContentType,
            Metadata:
              options.expectedSha256 === undefined
                ? object.Metadata
                : { ...object.Metadata, sha256: options.expectedSha256 },
            ChecksumSHA256:
              options.expectedSha256 === undefined
                ? undefined
                : Buffer.from(options.expectedSha256, "hex").toString("base64"),
            IfNoneMatch: "*",
          }),
        );
      } catch (error) {
        if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 412) {
          if (
            options.expectedSha256 !== undefined &&
            (await this.head(destinationName)).metadata.sha256 === options.expectedSha256
          )
            return;
          throw StorageConflictError({
            message: `Destination '${destinationName}' exists`,
            cause: error,
          });
        }
        throw error;
      } finally {
        if (body instanceof Readable) body.destroy();
      }
      return;
    }
    await this.clients().privateClient.send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(destinationName),
        CopySource: copySource(source.config.bucket, source.key(sourceName)),
        MetadataDirective: "COPY",
      }),
    );
  }

  async list(prefix = ""): Promise<string[]> {
    const keyPrefix = this.key(prefix);
    const ownPrefix = normalizePrefix(this.config.prefix);
    const names: string[] = [];
    let continuationToken: string | undefined;
    do {
      const result = await this.clients().privateClient.send(
        new ListObjectsV2Command({
          Bucket: this.config.bucket,
          Prefix: keyPrefix,
          ContinuationToken: continuationToken,
        }),
      );
      for (const item of result.Contents ?? []) {
        if (!item.Key) continue;
        names.push(
          ownPrefix === ""
            ? item.Key
            : item.Key.replace(new RegExp(`^${escapeRegex(ownPrefix)}/`), ""),
        );
      }
      continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
    } while (continuationToken !== undefined);
    return names.sort();
  }

  async updateMetadata(
    documentName: string,
    metadata: Readonly<Record<string, string>>,
    options: { readonly preserveExisting?: boolean; readonly overwriteExisting?: boolean } = {},
  ): Promise<void> {
    const head = await this.head(documentName);
    const preserveExisting = options.preserveExisting ?? true;
    const overwriteExisting = options.overwriteExisting ?? true;
    if (!overwriteExisting) {
      for (const [key, value] of Object.entries(metadata)) {
        if (head.metadata[key] !== undefined && head.metadata[key] !== value) {
          throw new Error(`Metadata key '${key}' already exists with a different value`);
        }
      }
    }
    const nextMetadata = preserveExisting ? { ...head.metadata, ...metadata } : { ...metadata };
    await this.clients().privateClient.send(
      new CopyObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(documentName),
        CopySource: copySource(this.config.bucket, this.key(documentName)),
        Metadata: nextMetadata,
        MetadataDirective: "REPLACE",
        ContentType: head.contentType ?? undefined,
      }),
    );
  }

  async presignUpload(
    documentName: string,
    options: {
      readonly expiresInSeconds: number;
      readonly contentType: string;
      readonly createNewVersion?: boolean;
      readonly internal?: boolean;
    },
  ): Promise<string> {
    if (!options.createNewVersion && (await this.exists(documentName))) {
      throw StorageConflictError({ message: `Document '${documentName}' exists` });
    }
    return getSignedUrl(
      options.internal ? this.clients().privateClient : this.clients().publicClient,
      new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(documentName),
        ContentType: options.contentType,
      }),
      {
        expiresIn: options.expiresInSeconds,
        // The incumbent rejects a PUT whose declared MIME type differs from
        // the one issued with the URL. S3's JS presigner excludes this header
        // by default, so opt it back into the canonical signed headers.
        signableHeaders: new Set(["content-type"]),
      },
    );
  }

  async presignDownload(
    documentName: string,
    options: {
      readonly expiresInSeconds: number;
      readonly contentType?: string;
      readonly inline?: boolean;
      readonly internal?: boolean;
    },
  ): Promise<string> {
    await this.head(documentName);
    const filename = normalizeDocumentName(documentName).split("/").at(-1) ?? documentName;
    const disposition = `${options.inline ? "inline" : "attachment"}; filename="${filename}"`;
    return getSignedUrl(
      options.internal ? this.clients().privateClient : this.clients().publicClient,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: this.key(documentName),
        ResponseContentDisposition: disposition,
        ResponseContentType: options.contentType,
      }),
      { expiresIn: options.expiresInSeconds },
    );
  }

  close(): void {
    this.privateClient?.destroy();
    this.publicClient?.destroy();
    this.privateClient = undefined;
    this.publicClient = undefined;
  }
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
