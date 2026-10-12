import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runProcess } from "@spark-workflow/test-support";
import { Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import { ClamAvClient } from "../src/scanner/clamav-client.ts";

import { DmsValidationError } from "../src/errors.ts";
import { createDmsActivities, type ActivityStorage } from "../src/temporal/activities.ts";
import type { DmsActivityRepository } from "../src/temporal/activity-repository.ts";
import { dmsErrors } from "../src/errors.ts";
import { StorageNotFoundError } from "../src/storage/s3-storage.ts";
import { StrictScannerFake } from "./support/strict-scanner-fake.ts";
import { extractZipArchive, validateZipArchive } from "../src/files/zip-extraction.ts";

async function storedZip(
  entries: Readonly<Record<string, Uint8Array>>,
  compressionLevel = 0,
): Promise<Uint8Array> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  for (const [name, bytes] of Object.entries(entries)) {
    await writer.add(name, new Uint8ArrayReader(bytes), { level: compressionLevel });
  }
  return writer.close();
}

const corruptFirstZipEntry = (zip: Uint8Array): Uint8Array => {
  const corrupted = zip.slice();
  const view = new DataView(corrupted.buffer, corrupted.byteOffset, corrupted.byteLength);
  const filenameLength = view.getUint16(26, true);
  const extraFieldLength = view.getUint16(28, true);
  const compressedSize = view.getUint32(18, true);
  const dataOffset = 30 + filenameLength + extraFieldLength;
  const corruptOffset = dataOffset + Math.max(0, Math.floor(compressedSize / 2));
  corrupted[corruptOffset] = (corrupted[corruptOffset] ?? 0) ^ 0xff;
  return corrupted;
};

class MemoryStorage implements ActivityStorage {
  readonly objects = new Map<
    string,
    {
      bytes: Uint8Array;
      contentType: string | null;
      metadata: Readonly<Record<string, string>>;
    }
  >();

  async head(path: string) {
    const value = this.objects.get(path);
    if (!value) throw new Error(`missing ${path}`);
    return {
      contentLength: value.bytes.length,
      contentType: value.contentType,
      metadata: value.metadata,
    };
  }

  file(path: string): Blob {
    const value = this.objects.get(path);
    if (!value) throw new Error(`missing ${path}`);
    return new Blob([
      value.bytes.buffer.slice(
        value.bytes.byteOffset,
        value.bytes.byteOffset + value.bytes.byteLength,
      ) as ArrayBuffer,
    ]);
  }

  async upload(
    path: string,
    bytes: Uint8Array,
    options: { contentType?: string; metadata?: Readonly<Record<string, string>> } = {},
  ) {
    this.objects.set(path, {
      bytes,
      contentType: options.contentType ?? null,
      metadata: options.metadata ?? {},
    });
  }

  async delete(path: string) {
    this.objects.delete(path);
  }
}

class EntryReadErrorBlob extends Blob {
  constructor(private readonly error: Error) {
    super();
  }

  override stream(): ReadableStream<Uint8Array<ArrayBuffer>> {
    const { error } = this;
    return new ReadableStream<Uint8Array<ArrayBuffer>>({
      start(controller) {
        controller.error(error);
      },
    });
  }
}

class EntryReadFailureBlob extends Blob {
  constructor(
    parts: BlobPart[],
    private readonly error: Error,
  ) {
    super(parts);
  }

  override slice(start?: number, end?: number, contentType?: string): Blob {
    if (start === 0) return new EntryReadErrorBlob(this.error);
    return super.slice(start, end, contentType);
  }
}

class EntryReadFailureStorage extends MemoryStorage {
  entryReadError: Error | null = null;

  override file(path: string): Blob {
    const file = super.file(path);
    return this.entryReadError === null
      ? file
      : new EntryReadFailureBlob([file], this.entryReadError);
  }
}

function repository(overrides: Partial<DmsActivityRepository> = {}): DmsActivityRepository {
  return {
    async listFiles() {
      return [];
    },
    async ingestFile() {
      return "40000000-0000-4000-8000-000000000004";
    },
    async renameFile() {
      return true;
    },
    async persistZipDiff() {},
    async updateZipStatus() {},
    async updateFileStatus() {},
    async updateZipApprovalStatus() {},
    ...overrides,
  };
}

const config = {
  zipLimits: {
    maxEntries: 10,
    maxSingleEntryBytes: 1_000_000,
    maxTotalUncompressedBytes: 2_000_000,
    maxCompressionRatio: 100,
    maxAppendedDataBytes: 65536,
  },
};

describe("DMS activity implementations", () => {
  test("rejects normalized ZIP filename collisions before scanning or storing an entry", async () => {
    for (const names of [
      ["report.pdf", "./report.pdf"],
      ["ä.pdf", "a\u0308.pdf"],
      ["folder/report.pdf", "folder\\report.pdf"],
    ]) {
      const source = new MemoryStorage();
      const target = new MemoryStorage();
      source.objects.set("archive.zip", {
        bytes: await storedZip(
          Object.fromEntries(
            names.map((name) => [name, new TextEncoder().encode("%PDF-1.7\nfixture")]),
          ),
        ),
        contentType: "application/zip",
        metadata: {},
      });
      const result = await extractZipArchive(
        {
          source,
          target,
          limits: config.zipLimits,
          scanner: {
            scanBytes: async () => {
              throw new Error("ambiguous archives must not be scanned");
            },
          },
        },
        {
          zipFileId: crypto.randomUUID(),
          projectId: crypto.randomUUID(),
          filename: "archive.zip",
          zipPath: "archive.zip",
          fileType: "zip",
        },
      );
      expect(result.isErr() && result.error.code).toBe(dmsErrors.ZIP_AMBIGUOUS.code);
      expect(target.objects.size).toBe(0);
    }
  });

  test("rejects ZIP entries beyond the filename depth limit", async () => {
    const source = new MemoryStorage();
    source.objects.set("archive.zip", {
      bytes: await storedZip({
        [`${"folder/".repeat(32)}file.pdf`]: new TextEncoder().encode("%PDF-1.7\n"),
      }),
      contentType: "application/zip",
      metadata: {},
    });
    const result = await validateZipArchive(source, "archive.zip", config.zipLimits);
    expect(result.isErr() && result.error.code).toBe(dmsErrors.ZIP_INVALID.code);
  });

  test("rejects an archive with more entries than the limit while listing entries", async () => {
    const source = new MemoryStorage();
    source.objects.set("archive.zip", {
      bytes: await storedZip(
        Object.fromEntries(
          Array.from({ length: config.zipLimits.maxEntries + 1 }, (_, index) => [
            `${index}.pdf`,
            new TextEncoder().encode("%PDF-1.7\n"),
          ]),
        ),
      ),
      contentType: "application/zip",
      metadata: {},
    });
    const result = await validateZipArchive(source, "archive.zip", config.zipLimits);
    expect(result.isErr() && result.error.message).toBe(
      `ZIP exceeds limit of ${config.zipLimits.maxEntries} entries`,
    );
  });

  test("rejects oversized central-directory reads before buffering metadata", async () => {
    const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
    for (let index = 0; index < 260; index++) {
      await writer.add(`${index}.pdf`, new Uint8ArrayReader(new Uint8Array()), {
        level: 0,
        comment: "c".repeat(65_000),
      });
    }
    const bytes = await writer.close();
    let largestRead = 0;
    class ObservedBlob extends Blob {
      override slice(start = 0, end = this.size, contentType?: string) {
        largestRead = Math.max(largestRead, end - start);
        return super.slice(start, end, contentType);
      }
    }
    const source = {
      head: async () => ({ contentLength: bytes.length }),
      file: () => new ObservedBlob([bytes]),
    };
    const result = await validateZipArchive(source, "archive.zip", {
      ...config.zipLimits,
      maxEntries: 1_000,
    });
    expect(result.isErr() && result.error.code).toBe(dmsErrors.ZIP_INVALID.code);
    expect(largestRead).toBeLessThanOrEqual(16 * 1024 * 1024);
  });

  test("releases extracted buffers between S3 ZIP activities", async () => {
    const pdf = new Uint8Array(32 * 1024 * 1024);
    pdf.set(new TextEncoder().encode("%PDF-1.7\n"));
    const directory = await mkdtemp(join(tmpdir(), "dms-zip-memory-"));
    try {
      const archivePath = join(directory, "archive.zip");
      await Bun.write(archivePath, await storedZip({ "report.pdf": pdf }));
      let getRequests = 0;
      let uploads = 0;
      // Measure the worker's retained buffers, not the storage server's buffers.
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        maxRequestBodySize: 64 * 1024 * 1024,
        async fetch(request) {
          if (request.method === "GET") getRequests++;
          if (request.method === "GET" || request.method === "HEAD") {
            return new Response(Bun.file(archivePath));
          }
          if (request.method === "PUT") {
            expect(new Uint8Array(await request.arrayBuffer())).toEqual(pdf);
            uploads++;
          }
          return new Response(null);
        },
      });
      try {
        expect(
          await runProcess(
            [
              "--smol",
              join(import.meta.dir, "fixtures", "zip-memory.ts"),
              server.url.origin,
              String(pdf.byteLength),
            ],
            { env: { BUN_JSC_gcMaxHeapSize: "536870912" }, timeout: 60_000 },
          ),
        ).toMatchObject({ exitCode: 0 });
        expect(getRequests).toBeLessThan(uploads * 32);
      } finally {
        await server.stop(true);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }, 120_000);

  test("keeps memory bounded while hashing large S3 files", async () => {
    const objectBytes = 256 * 1024 * 1024;
    const chunk = new Uint8Array(1024 * 1024);
    // Keep the object server outside the worker whose RSS is measured.
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(request) {
        const headers = { "Content-Length": String(objectBytes) };
        if (request.method === "HEAD") return new Response(null, { headers });
        let remaining = objectBytes;
        return new Response(
          new ReadableStream<Uint8Array>({
            async pull(controller) {
              if (remaining === 0) {
                controller.close();
                return;
              }
              // Measure retained payload, not an unpaced loopback receive burst.
              await Bun.sleep(1);
              controller.enqueue(chunk);
              remaining -= chunk.byteLength;
            },
          }),
          { headers },
        );
      },
    });
    try {
      expect(
        await runProcess(
          ["--smol", join(import.meta.dir, "fixtures", "diff-memory.ts"), server.url.origin],
          { env: { BUN_JSC_gcMaxHeapSize: "536870912" }, timeout: 60_000 },
        ),
      ).toMatchObject({ exitCode: 0 });
    } finally {
      await server.stop(true);
    }
  }, 120_000);

  test("can retry a completed ZIP extraction whose result was not acknowledged", async () => {
    const source = new MemoryStorage();
    const clean = new MemoryStorage();
    const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
    source.objects.set("uploads/archive.zip", {
      bytes: await storedZip({ "folder/report.pdf": pdf, "../escape.pdf": pdf }),
      contentType: "application/zip",
      metadata: {},
    });
    const activities = createDmsActivities({
      repository: repository(),
      zipSourceStorage: source,
      cleanStorage: clean,
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          return { isClean: true, threatName: null };
        },
      },
      config,
    });

    expect(
      await activities.validateZip({
        zipPath: "uploads/archive.zip",
        filename: "archive.zip",
      }),
    ).toEqual({ ok: true, value: { entryCount: 1, totalUncompressedSize: pdf.length } });
    const input = {
      zipFileId: "10000000-0000-4000-8000-000000000001",
      filename: "archive.zip",
      projectId: "20000000-0000-4000-8000-000000000002",
      zipPath: "uploads/archive.zip",
      fileType: "zip" as const,
    };
    const extraction = await activities.extractZip(input);
    expect(extraction).toEqual({
      ok: true,
      value: [
        {
          success: true,
          filename: "folder/report.pdf",
          action: "UNZIP",
          fileId: null,
          bucketPath:
            "tmp/20000000-0000-4000-8000-000000000002/10000000-0000-4000-8000-000000000001/folder/report.pdf",
          errorCode: null,
          errorMessage: null,
        },
      ],
    });
    const retry = await activities.extractZip(input);
    expect(retry).toEqual(extraction);
    expect(source.objects.has(input.zipPath)).toBe(true);
    expect(
      clean.objects.get(`tmp/${input.projectId}/${input.zipFileId}/folder/report.pdf`)?.bytes,
    ).toEqual(pdf);
  });

  test.each(["closed", "unavailable"] as const)(
    "retains the source and retries extraction after a %s scanner failure",
    async (outcome) => {
      const source = new MemoryStorage();
      const clean = new MemoryStorage();
      const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
      source.objects.set("uploads/archive.zip", {
        bytes: await storedZip({ "report.pdf": pdf }),
        contentType: "application/zip",
        metadata: {},
      });
      const scanner = new StrictScannerFake(
        { outcome, body: pdf },
        { outcome: "clean", body: pdf },
      ).start();
      try {
        const activities = createDmsActivities({
          repository: repository(),
          zipSourceStorage: source,
          cleanStorage: clean,
          scanner: new ClamAvClient({ enabled: true, baseUrl: scanner.baseUrl }),
          scanAndPromote: {
            async execute() {
              return { isClean: true, threatName: null };
            },
          },
          config,
        });
        const input = {
          zipFileId: "10000000-0000-4000-8000-000000000001",
          projectId: "20000000-0000-4000-8000-000000000002",
          filename: "archive.zip",
          zipPath: "uploads/archive.zip",
          fileType: "zip" as const,
        };

        await expect(activities.extractZip(input)).rejects.toBeInstanceOf(Error);
        expect(clean.objects.size).toBe(0);
        expect(source.objects.has(input.zipPath)).toBe(true);

        const retry = await activities.extractZip(input);
        expect(retry).toMatchObject({
          ok: true,
          value: [{ success: true, filename: "report.pdf" }],
        });
        expect(
          clean.objects.get(`tmp/${input.projectId}/${input.zipFileId}/report.pdf`)?.bytes,
        ).toEqual(pdf);
        scanner.assertComplete();
      } finally {
        scanner.stop();
      }
    },
  );

  test("retries ZIP cleanup safely without swallowing storage failures", async () => {
    const source = new MemoryStorage();
    source.objects.set("uploads/archive.zip", {
      bytes: await storedZip({ "report.pdf": new TextEncoder().encode("%PDF-1.7\nfixture") }),
      contentType: "application/zip",
      metadata: {},
    });
    const activities = createDmsActivities({
      repository: repository(),
      zipSourceStorage: source,
      cleanStorage: new MemoryStorage(),
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          return { isClean: true, threatName: null };
        },
      },
      config,
    });
    const input = { zipPath: "uploads/archive.zip" };
    await activities.deleteZipSource(input);
    expect(source.objects.has(input.zipPath)).toBe(false);
    source.delete = async () => {
      throw StorageNotFoundError({ message: "Already deleted" });
    };
    await activities.deleteZipSource(input);
    source.delete = async () => {
      throw dmsErrors.STORAGE_UNAVAILABLE();
    };
    await expect(activities.deleteZipSource(input)).rejects.toMatchObject({
      code: dmsErrors.STORAGE_UNAVAILABLE.code,
    });
  });

  test("keeps valid ZIP entries when another entry has corrupt compressed data", async () => {
    const source = new MemoryStorage();
    const clean = new MemoryStorage();
    const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
    source.objects.set("uploads/archive.zip", {
      bytes: corruptFirstZipEntry(await storedZip({ "broken.pdf": pdf, "valid.pdf": pdf }, 6)),
      contentType: "application/zip",
      metadata: {},
    });
    const activities = createDmsActivities({
      repository: repository(),
      zipSourceStorage: source,
      cleanStorage: clean,
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          return { isClean: true, threatName: null };
        },
      },
      config,
    });

    const results = await activities.extractZip({
      zipFileId: "10000000-0000-4000-8000-000000000001",
      filename: "archive.zip",
      projectId: "20000000-0000-4000-8000-000000000002",
      zipPath: "uploads/archive.zip",
      fileType: "zip",
    });

    expect(results).toEqual({
      ok: true,
      value: expect.arrayContaining([
        expect.objectContaining({
          success: false,
          filename: "broken.pdf",
          errorCode: "ZIP_INVALID",
        }),
        expect.objectContaining({
          success: true,
          filename: "valid.pdf",
        }),
      ]),
    });
    expect(results.ok ? results.value : []).toHaveLength(2);
  });

  test("returns ZIP_NOT_FOUND when the ZIP is missing during validation", async () => {
    const source = new MemoryStorage();
    source.head = async () => {
      throw StorageNotFoundError({ message: "Zip file not found in storage" });
    };
    const activities = createDmsActivities({
      repository: repository(),
      zipSourceStorage: source,
      cleanStorage: new MemoryStorage(),
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          return { isClean: true, threatName: null };
        },
      },
      config,
    });

    expect(
      await activities.validateZip({ zipPath: "uploads/missing.zip", filename: "missing.zip" }),
    ).toMatchObject({ ok: false, failure: { code: "ZIP_NOT_FOUND" } });
  });

  test.each([
    ["an S3", Object.assign(new Error("temporary S3 read failure"), { name: "S3Error" })],
    ["an unrecognized", new Error("socket hang up")],
  ])("throws %s entry-read failure for retry without deleting the source ZIP", async (_, error) => {
    const source = new EntryReadFailureStorage();
    const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
    source.objects.set("uploads/archive.zip", {
      bytes: await storedZip({ "report.pdf": pdf }),
      contentType: "application/zip",
      metadata: {},
    });
    source.entryReadError = error;
    const activities = createDmsActivities({
      repository: repository(),
      zipSourceStorage: source,
      cleanStorage: new MemoryStorage(),
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          return { isClean: true, threatName: null };
        },
      },
      config,
    });

    expect(
      await activities
        .extractZip({
          zipFileId: "10000000-0000-4000-8000-000000000001",
          filename: "archive.zip",
          projectId: "20000000-0000-4000-8000-000000000002",
          zipPath: "uploads/archive.zip",
          fileType: "zip",
        })
        .catch((error) => error),
    ).toMatchObject({ code: dmsErrors.STORAGE_UNAVAILABLE.code });
    expect(source.objects.has("uploads/archive.zip")).toBe(true);
  });

  test("fails an all-corrupt ZIP with ZIP_INVALID", async () => {
    const source = new MemoryStorage();
    const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
    source.objects.set("uploads/archive.zip", {
      bytes: corruptFirstZipEntry(await storedZip({ "broken.pdf": pdf }, 6)),
      contentType: "application/zip",
      metadata: {},
    });
    const activities = createDmsActivities({
      repository: repository(),
      zipSourceStorage: source,
      cleanStorage: new MemoryStorage(),
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          return { isClean: true, threatName: null };
        },
      },
      config,
    });

    const result = await activities.extractZip({
      zipFileId: "10000000-0000-4000-8000-000000000001",
      filename: "archive.zip",
      projectId: "20000000-0000-4000-8000-000000000002",
      zipPath: "uploads/archive.zip",
      fileType: "zip",
    });
    expect(result).toMatchObject({ ok: false, failure: { code: "ZIP_INVALID" } });
  });

  test("fails a ZIP whose entries fail differently with NO_PROCESSABLE_FILES", async () => {
    const source = new MemoryStorage();
    source.objects.set("uploads/archive.zip", {
      bytes: await storedZip({
        "report.pdf": new TextEncoder().encode("%PDF-1.7\nfixture"),
        "E1234_notes.txt": new TextEncoder().encode("notes"),
      }),
      contentType: "application/zip",
      metadata: {},
    });
    const activities = createDmsActivities({
      repository: repository(),
      zipSourceStorage: source,
      cleanStorage: new MemoryStorage(),
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          return { isClean: true, threatName: null };
        },
      },
      config,
    });

    const result = await activities.extractZip({
      zipFileId: "10000000-0000-4000-8000-000000000001",
      filename: "archive.zip",
      projectId: "20000000-0000-4000-8000-000000000002",
      zipPath: "uploads/archive.zip",
      fileType: "ewms_zip",
    });
    expect(result).toMatchObject({ ok: false, failure: { code: "NO_PROCESSABLE_FILES" } });
  });

  test("returns ZIP_ENCRYPTED for a password-protected ZIP", async () => {
    const source = new MemoryStorage();
    const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
    await writer.add(
      "report.pdf",
      new Uint8ArrayReader(new TextEncoder().encode("%PDF-1.7\nfixture")),
      { password: "secret" },
    );
    source.objects.set("uploads/archive.zip", {
      bytes: await writer.close(),
      contentType: "application/zip",
      metadata: {},
    });
    const activities = createDmsActivities({
      repository: repository(),
      zipSourceStorage: source,
      cleanStorage: new MemoryStorage(),
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          return { isClean: true, threatName: null };
        },
      },
      config,
    });

    expect(
      await activities.validateZip({ zipPath: "uploads/archive.zip", filename: "archive.zip" }),
    ).toMatchObject({ ok: false, failure: { code: "ZIP_ENCRYPTED" } });
  });

  test("tolerates a stray HTTP error response appended after an otherwise-intact ZIP", async () => {
    const source = new MemoryStorage();
    const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
    const zip = await storedZip({ "report.pdf": pdf });
    const appended = new TextEncoder().encode(
      "HTTP/1.0 503 Cannot_commit\r\nContent-Type: text/html\r\n\r\n<html>Error</html>",
    );
    const bytes = new Uint8Array(zip.length + appended.length);
    bytes.set(zip, 0);
    bytes.set(appended, zip.length);
    source.objects.set("uploads/archive.zip", {
      bytes,
      contentType: "application/zip",
      metadata: {},
    });
    const activities = createDmsActivities({
      repository: repository(),
      zipSourceStorage: source,
      cleanStorage: source,
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          return { isClean: true, threatName: null };
        },
      },
      config,
    });

    expect(
      await activities.validateZip({ zipPath: "uploads/archive.zip", filename: "archive.zip" }),
    ).toEqual({ ok: true, value: { entryCount: 1, totalUncompressedSize: pdf.length } });
  });

  test("rejects appended ZIP data when the configured tolerance is zero", async () => {
    const source = new MemoryStorage();
    const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
    const zip = await storedZip({ "report.pdf": pdf });
    const appended = new TextEncoder().encode("trailing-bytes");
    const bytes = new Uint8Array(zip.length + appended.length);
    bytes.set(zip, 0);
    bytes.set(appended, zip.length);
    source.objects.set("uploads/archive.zip", {
      bytes,
      contentType: "application/zip",
      metadata: {},
    });
    const activities = createDmsActivities({
      repository: repository(),
      zipSourceStorage: source,
      cleanStorage: source,
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          return { isClean: true, threatName: null };
        },
      },
      config: {
        zipLimits: {
          ...config.zipLimits,
          maxAppendedDataBytes: 0,
        },
      },
    });

    expect(
      await activities.validateZip({ zipPath: "uploads/archive.zip", filename: "archive.zip" }),
    ).toMatchObject({ ok: false, failure: { code: "ZIP_AMBIGUOUS" } });
  });

  test("rejects a ZIP with a large amount of appended data as ZIP_AMBIGUOUS", async () => {
    const source = new MemoryStorage();
    const pdf = new TextEncoder().encode("%PDF-1.7\nfixture");
    const zip = await storedZip({ "report.pdf": pdf });
    const appended = new Uint8Array(config.zipLimits.maxAppendedDataBytes + 1);
    const bytes = new Uint8Array(zip.length + appended.length);
    bytes.set(zip, 0);
    bytes.set(appended, zip.length);
    source.objects.set("uploads/archive.zip", {
      bytes,
      contentType: "application/zip",
      metadata: {},
    });
    const activities = createDmsActivities({
      repository: repository(),
      zipSourceStorage: source,
      cleanStorage: source,
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          return { isClean: true, threatName: null };
        },
      },
      config,
    });

    expect(
      await activities.validateZip({ zipPath: "uploads/archive.zip", filename: "archive.zip" }),
    ).toMatchObject({ ok: false, failure: { code: "ZIP_AMBIGUOUS" } });
  });

  test("computes EWMS duplicate detection and reports infected single uploads as non-retryable", async () => {
    const storage = new MemoryStorage();
    const activities = createDmsActivities({
      repository: repository({
        async listFiles() {
          return [
            {
              id: "50000000-0000-4000-8000-000000000005",
              filename: "existing/E1234.pdf",
              bucketPath: "ewms/E1234.pdf",
            },
          ];
        },
      }),
      zipSourceStorage: storage,
      cleanStorage: storage,
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          return { isClean: false, threatName: "EICAR" };
        },
      },
      config,
    });
    expect(
      await activities.createDiff({
        projectId: "20000000-0000-4000-8000-000000000002",
        zipFileId: "10000000-0000-4000-8000-000000000001",
        projectVersion: 1,
        entryFileType: "ewms_document",
        files: [
          {
            success: true,
            filename: "incoming/E1234.pdf",
            action: "UNZIP",
            fileId: null,
            bucketPath: "tmp/E1234.pdf",
            errorCode: null,
            errorMessage: null,
          },
        ],
      }),
    ).toMatchObject({
      new: [],
      duplicate: [
        {
          filename: "E1234.pdf",
          existingFileId: "50000000-0000-4000-8000-000000000005",
        },
      ],
    });

    expect(
      await activities
        .scanAndUpload({
          fileId: "60000000-0000-4000-8000-000000000006",
          bucketPath: "quarantine/report.pdf",
          filename: "report.pdf",
          fileType: "document",
        })
        .catch((error) => error),
    ).toMatchObject({
      type: "VIRUS_DETECTED",
      nonRetryable: true,
    });
  });

  test("reports rejected upload content as a non-retryable upload failure", async () => {
    const storage = new MemoryStorage();
    const activities = createDmsActivities({
      repository: repository(),
      zipSourceStorage: storage,
      cleanStorage: storage,
      scanner: {
        async scanBytes() {
          return { isClean: true, threatName: null };
        },
      },
      scanAndPromote: {
        async execute() {
          throw DmsValidationError({ message: "Stored file exceeds the maximum size of 12 bytes" });
        },
      },
      config,
    });

    expect(
      await activities
        .scanAndUpload({
          fileId: "60000000-0000-4000-8000-000000000006",
          bucketPath: "quarantine/report.pdf",
          filename: "report.pdf",
          fileType: "document",
        })
        .catch((error) => error),
    ).toMatchObject({
      type: "UPLOAD_FAILED",
      nonRetryable: true,
      message: "Stored file exceeds the maximum size of 12 bytes",
    });
  });
});
