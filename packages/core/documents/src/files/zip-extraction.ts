import {
  ERR_AMBIGUOUS_ARCHIVE,
  ERR_BAD_FORMAT,
  ERR_CENTRAL_DIRECTORY_NOT_FOUND,
  ERR_ENCRYPTED,
  ERR_ENCRYPTED_CENTRAL_DIRECTORY,
  ERR_ENTRY_DATA_OUT_OF_BOUNDS,
  ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND,
  ERR_EOCDR_NOT_FOUND,
  ERR_EXTRAFIELD_ZIP64_NOT_FOUND,
  ERR_INVALID_COMPRESSED_DATA,
  ERR_INVALID_SIGNATURE,
  ERR_INVALID_UNCOMPRESSED_SIZE,
  ERR_LOCAL_FILE_HEADER_NOT_FOUND,
  ERR_OVERLAPPING_ENTRY,
  ERR_RESERVED_COMPRESSION_METHOD,
  ERR_SPLIT_ZIP_FILE,
  ERR_UNSUPPORTED_COMPRESSION,
  ERR_UNSUPPORTED_ENCRYPTION,
  type Entry,
  type FileEntry,
  BlobReader,
  ZipReader,
} from "@zip.js/zip.js";
import { Result } from "better-result";
import { Value } from "@sinclair/typebox/value";
import { EvlogError } from "evlog";

import { dmsErrors } from "../errors.ts";
import { FilenameSchema } from "./file-types.ts";
import type { VirusScanResult } from "../scanner/clamav-client.ts";
import type {
  SingleFileResult,
  ValidateZipOutput,
  ZipActivityResult,
} from "../temporal/contracts.ts";
import { type ZipFailureCode, zipFailureCodes } from "../temporal/zip-failure-codes.ts";

export interface ZipLimits {
  readonly maxEntries: number;
  readonly maxSingleEntryBytes: number;
  readonly maxTotalUncompressedBytes: number;
  readonly maxCompressionRatio: number;
  readonly maxAppendedDataBytes: number;
}

export interface ZipSourceStorage {
  head(path: string): Promise<{ readonly contentLength: number | null }>;
  file(path: string): Blob;
}

export interface ZipTargetStorage {
  upload(
    path: string,
    bytes: Uint8Array,
    options?: {
      readonly overwrite?: boolean;
      readonly contentType?: string;
      readonly metadata?: Readonly<Record<string, string>>;
    },
  ): Promise<void>;
}

export interface ZipExtractionDependencies {
  readonly source: ZipSourceStorage;
  readonly target: ZipTargetStorage;
  readonly scanner: {
    scanBytes(bytes: Uint8Array): Promise<VirusScanResult>;
  };
  readonly limits: ZipLimits;
}

export interface ZipExtractionInput {
  readonly zipFileId: string;
  readonly filename: string;
  readonly projectId: string;
  readonly zipPath: string;
  readonly fileType: "zip" | "ewms_zip";
}

interface StoredZipEntry {
  readonly entry: FileEntry;
  readonly name: string;
}

interface OpenZip {
  readonly reader: ZipReader<Blob>;
  readonly entries: readonly StoredZipEntry[];
}

const zipFailureByCatalogCode = new Map<string, ZipFailureCode>(
  zipFailureCodes.map((code) => [dmsErrors[code].code, code]),
);

/** The ZIP failure a catalog error represents, or null for an infrastructure failure. */
const zipFailureCode = (error: EvlogError): ZipFailureCode | null =>
  zipFailureByCatalogCode.get(error.code ?? "") ?? null;

/**
 * Converts a ZIP service result into the activity payload the workflow persists.
 * Infrastructure failures stay thrown so Temporal retries the activity.
 */
export const zipActivityResult = <T>(result: Result<T, EvlogError>): ZipActivityResult<T> => {
  if (result.isOk()) return { ok: true, value: result.value };
  const code = zipFailureCode(result.error);
  if (code === null) throw result.error;
  return { ok: false, failure: { code, message: result.error.message } };
};

const invalidZip = (overrides: { cause: Error }): EvlogError =>
  dmsErrors.ZIP_INVALID({ message: overrides.cause.message, cause: overrides.cause });

// zip.js throws plain errors whose messages are its exported ERR_* constants.
const zipLibraryFailures = new Map<string, (overrides: { cause: Error }) => EvlogError>([
  [ERR_AMBIGUOUS_ARCHIVE, dmsErrors.ZIP_AMBIGUOUS],
  [ERR_ENCRYPTED, dmsErrors.ZIP_ENCRYPTED],
  [ERR_ENCRYPTED_CENTRAL_DIRECTORY, dmsErrors.ZIP_ENCRYPTED],
  [ERR_UNSUPPORTED_ENCRYPTION, dmsErrors.ZIP_ENCRYPTED],
  [ERR_UNSUPPORTED_COMPRESSION, dmsErrors.ZIP_UNSUPPORTED_COMPRESSION],
  [ERR_SPLIT_ZIP_FILE, dmsErrors.ZIP_SPLIT],
  ...[
    ERR_BAD_FORMAT,
    ERR_CENTRAL_DIRECTORY_NOT_FOUND,
    ERR_ENTRY_DATA_OUT_OF_BOUNDS,
    ERR_EOCDR_LOCATOR_ZIP64_NOT_FOUND,
    ERR_EOCDR_NOT_FOUND,
    ERR_EXTRAFIELD_ZIP64_NOT_FOUND,
    ERR_INVALID_COMPRESSED_DATA,
    ERR_INVALID_SIGNATURE,
    ERR_INVALID_UNCOMPRESSED_SIZE,
    ERR_LOCAL_FILE_HEADER_NOT_FOUND,
    ERR_OVERLAPPING_ENTRY,
    ERR_RESERVED_COMPRESSION_METHOD,
  ].map((message) => [message, invalidZip] as const),
]);

// Bun's DecompressionStream rejects corrupt deflate data with this TypeError.
const isCorruptDeflate = (cause: Error): boolean =>
  cause instanceof TypeError && cause.message === "inflate failed";

/** Only known ZIP data errors fail the ZIP; any other read error is retried as infrastructure. */
const zipReadFailure = (cause: unknown): EvlogError => {
  if (EvlogError.isEvlogError(cause)) return cause;
  if (!(cause instanceof Error)) return dmsErrors.STORAGE_UNAVAILABLE();
  if (isCorruptDeflate(cause)) return invalidZip({ cause });
  const failure = zipLibraryFailures.get(cause.message);
  return failure === undefined ? dmsErrors.STORAGE_UNAVAILABLE({ cause }) : failure({ cause });
};

const archiveSize = (
  storage: ZipSourceStorage,
  path: string,
): Promise<Result<number, EvlogError>> =>
  Result.tryPromise({
    try: () => storage.head(path),
    catch: (cause) =>
      EvlogError.isEvlogError(cause) && cause.code === dmsErrors.STORAGE_NOT_FOUND.code
        ? dmsErrors.ZIP_NOT_FOUND({ cause })
        : dmsErrors.STORAGE_UNAVAILABLE({ cause: cause instanceof Error ? cause : undefined }),
  }).then(
    Result.andThen(({ contentLength }) =>
      contentLength === null
        ? Result.err(dmsErrors.ZIP_INVALID({ message: "ZIP archive size is missing" }))
        : Result.ok(contentLength),
    ),
  );

const zipMetadataReadBytes = 16 * 1024 * 1024;
const zipMetadataBudgetBytes = 32 * 1024 * 1024;

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

// zip.js decodes filenames as CP437 whenever the UTF-8 bit isn't set on the entry, even
// though many tools (notably macOS's zip/Archive Utility with NFD-decomposed umlauts) write
// valid UTF-8 bytes without setting that flag. Prefer a strict UTF-8 decode of the raw bytes
// in that case, falling back to zip.js's own (CP437) decoding by returning undefined when
// the bytes aren't valid UTF-8.
const decodeZipText = (value: Uint8Array, encoding: string): string | undefined => {
  if (encoding === "utf-8") return undefined;
  try {
    return utf8Decoder.decode(value);
  } catch {
    return undefined;
  }
};

const safeZipName = (raw: string): string | null => {
  const normalized = raw.normalize("NFC").replaceAll("\\", "/");
  if (normalized.endsWith("/")) return null;
  const parts: string[] = [];
  for (const part of normalized.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") return null;
    parts.push(part);
  }
  if (parts.length === 0 || parts[0] === "__MACOSX") return null;
  const name = parts.join("/");
  if (name.startsWith("._") || name.endsWith("/.DS_Store")) return null;
  return name;
};

const limitedEntries = (
  archiveEntries: readonly Entry[],
  limits: ZipLimits,
): Result<StoredZipEntry[], EvlogError> => {
  const invalid = (message: string) => Result.err(dmsErrors.ZIP_INVALID({ message }));
  const entries: StoredZipEntry[] = [];
  const names = new Set<string>();
  let totalUncompressedSize = 0;
  for (const entry of archiveEntries) {
    if (entry.encrypted) {
      return Result.err(
        dmsErrors.ZIP_ENCRYPTED({ message: "Encrypted ZIP entries are not supported" }),
      );
    }
    if (entry.directory || entry.symlink) continue;
    const name = safeZipName(entry.filename);
    if (name === null) continue;
    if (!Value.Check(FilenameSchema, name)) {
      return invalid("ZIP filename exceeds the supported path limits");
    }
    if (names.has(name)) {
      return Result.err(
        dmsErrors.ZIP_AMBIGUOUS({
          message: `ZIP contains duplicate normalized filename '${name}'`,
        }),
      );
    }
    names.add(name);
    if (entry.uncompressedSize > limits.maxSingleEntryBytes) {
      return invalid(
        `Entry '${name}' is ${entry.uncompressedSize} bytes, exceeding limit of ${limits.maxSingleEntryBytes}`,
      );
    }
    if (
      entry.compressedSize > 0 &&
      entry.uncompressedSize / entry.compressedSize > limits.maxCompressionRatio
    ) {
      return invalid(
        `Entry '${name}' exceeds compression ratio limit of ${limits.maxCompressionRatio}:1`,
      );
    }
    totalUncompressedSize += entry.uncompressedSize;
    if (totalUncompressedSize > limits.maxTotalUncompressedBytes) {
      return invalid(
        `ZIP total uncompressed size exceeds limit of ${limits.maxTotalUncompressedBytes}`,
      );
    }
    entries.push({ entry, name });
  }
  return Result.ok(entries);
};

/** Opens a stored ZIP within the limits. On success the caller closes the reader. */
async function openZip(
  storage: ZipSourceStorage,
  path: string,
  limits: ZipLimits,
): Promise<Result<OpenZip, EvlogError>> {
  const size = await archiveSize(storage, path);
  if (size.isErr()) return size;
  const file = storage.file(path);
  const source = new BlobReader(file);
  source.size = size.value;
  let readingMetadata = true;
  let metadataBytes = 0;
  source.readUint8Array = async (offset, length) => {
    if (readingMetadata) {
      metadataBytes += length;
      if (
        !Number.isSafeInteger(length) ||
        length < 0 ||
        length > zipMetadataReadBytes ||
        metadataBytes > zipMetadataBudgetBytes
      ) {
        throw dmsErrors.ZIP_INVALID({
          message: "ZIP metadata exceeds the supported 16 MiB range or 32 MiB total budget",
        });
      }
    }
    const bytes = await Bun.readableStreamToBytes(file.slice(offset, offset + length).stream());
    return bytes.subarray(0, length);
  };
  const reader = new ZipReader(source, {
    filenameValidation: "tolerant",
    strictness: "strict",
    maxAppendedDataSize: limits.maxAppendedDataBytes,
    useWebWorkers: false,
    decodeText: (value: Uint8Array, encoding: string, type: "filename" | "comment") =>
      type === "filename" ? decodeZipText(value, encoding) : undefined,
  });
  const entries = await Result.tryPromise({
    try: async () => {
      const archiveEntries: Entry[] = [];
      for await (const entry of reader.getEntriesGenerator()) {
        if (archiveEntries.length === limits.maxEntries) {
          throw dmsErrors.ZIP_INVALID({
            message: `ZIP exceeds limit of ${limits.maxEntries} entries`,
          });
        }
        archiveEntries.push(entry);
      }
      return archiveEntries;
    },
    catch: zipReadFailure,
  }).then(Result.andThen((archiveEntries) => limitedEntries(archiveEntries, limits)));
  if (entries.isErr()) {
    await reader.close();
    return entries;
  }
  readingMetadata = false;
  return Result.ok({ reader, entries: entries.value });
}

const readEntry = (entry: FileEntry): Promise<Result<Uint8Array, EvlogError>> =>
  Result.tryPromise({
    try: async () =>
      new Uint8Array(
        await entry.arrayBuffer({
          checkCrc32: true,
          checkLocalDirectory: true,
          useWebWorkers: false,
        }),
      ),
    catch: zipReadFailure,
  });

const ewmsFilename = (filename: string): boolean =>
  /^[ESN]\d{4}.*$/.test(filename.replaceAll("\\", "/").split("/").at(-1) ?? filename);

const pdf = (filename: string, bytes: Uint8Array): Result<void, EvlogError> => {
  if (!filename.toLowerCase().endsWith(".pdf")) {
    return Result.err(
      dmsErrors.UNSUPPORTED_FILETYPE({
        message: `File type for '${filename}' is not supported; only .pdf is allowed`,
      }),
    );
  }
  if (
    bytes.length < 5 ||
    bytes[0] !== 0x25 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x44 ||
    bytes[3] !== 0x46 ||
    bytes[4] !== 0x2d
  ) {
    return Result.err(
      dmsErrors.UNSUPPORTED_FILETYPE({ message: `File content for '${filename}' is not a PDF` }),
    );
  }
  return Result.ok(undefined);
};

const sha256 = (bytes: Uint8Array): string => {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(bytes);
  return hash.digest("hex");
};

/** Validates, scans, and uploads one entry. Returns the clean bucket path. */
async function extractEntry(
  dependencies: ZipExtractionDependencies,
  input: ZipExtractionInput,
  { entry, name }: StoredZipEntry,
): Promise<Result<string, EvlogError>> {
  if (input.fileType === "ewms_zip" && !ewmsFilename(name)) {
    return Result.err(dmsErrors.INVALID_FILENAME());
  }
  const bytes = await readEntry(entry);
  if (bytes.isErr()) return bytes;
  const type = pdf(name, bytes.value);
  if (type.isErr()) return type;
  const scan = await dependencies.scanner.scanBytes(bytes.value);
  if (!scan.isClean) {
    return Result.err(
      dmsErrors.VIRUS_DETECTED({
        message: `Virus detected in ZIP entry '${name}': ${scan.threatName ?? "unknown threat"}`,
      }),
    );
  }
  const bucketPath = `tmp/${input.projectId}/${input.zipFileId}/${name}`;
  await dependencies.target.upload(bucketPath, bytes.value, {
    overwrite: true,
    contentType: "application/pdf",
    metadata: { sha256: sha256(bytes.value) },
  });
  return Result.ok(bucketPath);
}

const extracted = (filename: string, bucketPath: string): SingleFileResult => ({
  success: true,
  filename,
  action: "UNZIP",
  fileId: null,
  bucketPath,
  errorCode: null,
  errorMessage: null,
});

const rejected = (filename: string, code: ZipFailureCode, error: EvlogError): SingleFileResult => ({
  success: false,
  filename,
  action: "UNZIP",
  fileId: null,
  bucketPath: null,
  errorCode: code,
  errorMessage: error.message,
});

/** One shared entry failure fails the ZIP with that failure; mixed failures do not. */
const noProcessableFiles = (failures: readonly EvlogError[]): EvlogError => {
  const codes = [...new Set(failures.map((error) => error.code))];
  const [only] = failures;
  return codes.length === 1 && only !== undefined
    ? only
    : dmsErrors.NO_PROCESSABLE_FILES({
        message: `ZIP contains no processable PDF files (${codes.join(", ")})`,
      });
};

export async function validateZipArchive(
  storage: ZipSourceStorage,
  path: string,
  limits: ZipLimits,
): Promise<Result<ValidateZipOutput, EvlogError>> {
  const archive = await openZip(storage, path, limits);
  if (archive.isErr()) return archive;
  await archive.value.reader.close();
  return Result.ok({
    entryCount: archive.value.entries.length,
    totalUncompressedSize: archive.value.entries.reduce(
      (total, { entry }) => total + entry.uncompressedSize,
      0,
    ),
  });
}

/**
 * Extracts every processable PDF into the clean storage. Entry failures stay in the
 * results; the ZIP fails only when it cannot be read or no entry is processable.
 */
export async function extractZipArchive(
  dependencies: ZipExtractionDependencies,
  input: ZipExtractionInput,
): Promise<Result<SingleFileResult[], EvlogError>> {
  const archive = await openZip(dependencies.source, input.zipPath, dependencies.limits);
  if (archive.isErr()) return archive;
  const results: SingleFileResult[] = [];
  const failures: EvlogError[] = [];
  try {
    for (const stored of archive.value.entries) {
      const bucketPath = await extractEntry(dependencies, input, stored);
      if (bucketPath.isOk()) {
        results.push(extracted(stored.name, bucketPath.value));
        continue;
      }
      const code = zipFailureCode(bucketPath.error);
      if (code === null) return bucketPath;
      failures.push(bucketPath.error);
      results.push(rejected(stored.name, code, bucketPath.error));
    }
  } finally {
    await archive.value.reader.close();
  }
  if (results.length > 0 && failures.length === results.length) {
    return Result.err(noProcessableFiles(failures));
  }
  return Result.ok(results);
}
