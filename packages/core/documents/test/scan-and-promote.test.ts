import { describe, expect, test } from "bun:test";
import { Redacted } from "effect";

import { files } from "../src/db/schema.ts";
import type { DmsDatabase } from "../src/db.ts";
import { DmsValidationError } from "../src/errors.ts";
import { FileService } from "../src/files/file-service.ts";
import { ClamAvClient } from "../src/scanner/clamav-client.ts";
import { ScanAndPromoteService } from "../src/scanner/scan-and-promote.ts";
import { S3Storage } from "../src/storage/s3-storage.ts";
import {
  assertMutationProjectsAbsent,
  cleanupMutationProjects,
  createMutationDatabase,
  readMutationProjectState,
} from "./support/mutation-database.ts";
import { StrictScannerFake, type ScannerOutcome } from "./support/strict-scanner-fake.ts";
import { testScope } from "../../projects/test/support/scopes.ts";

const realBoundary = process.env.DMS_BOUNDARY_PROFILE === "real" ? describe : describe.skip;
const exactBytes = new TextEncoder().encode(
  "%PDF-1.4\nDMS TypeScript scan and promote\0binary\n%%EOF\n",
);
const overwrittenBytes = new TextEncoder().encode(
  "%PDF-1.4\nDMS TypeScript scan and promote\0binary\n%%EOF\nreplaced after confirmation\n",
);
const oversizedOverwrite = "oversized overwrite";
type Scenario = ScannerOutcome | typeof oversizedOverwrite;

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set by the real DMS boundary profile`);
  return value;
};

const storage = (bucket: string, quarantine: boolean): S3Storage =>
  new S3Storage({
    bucket,
    prefix: required("DOC_STORE_PATH"),
    privateEndpoint: quarantine
      ? required("QUARANTINE_S3_ENDPOINT_URL")
      : required("S3_ENDPOINT_URL"),
    publicEndpoint: required("S3_EXTERNAL_URL"),
    accessKeyId: Redacted.make(
      quarantine ? required("QUARANTINE_S3_ACCESS_KEY_ID") : required("S3_ACCESS_KEY_ID"),
    ),
    secretAccessKey: Redacted.make(
      quarantine ? required("QUARANTINE_S3_SECRET_ACCESS_KEY") : required("S3_SECRET_ACCESS_KEY"),
    ),
    region: required("S3_REGION"),
  });

class ProjectVersionFake {
  private calls = 0;
  private readonly failures: string[] = [];

  constructor(
    private readonly projectId: string,
    private readonly expectedCalls: number,
  ) {}

  async latestOne(projectId: string): Promise<number> {
    this.calls += 1;
    if (projectId !== this.projectId) {
      this.failures.push(`unexpected project-version read for ${projectId}`);
    }
    return 1;
  }

  async ensureWritable(projectId: string, projectVersion: number): Promise<number> {
    if (projectId !== this.projectId) {
      this.failures.push(`unexpected project-version write for ${projectId}`);
    }
    return projectVersion;
  }

  assertComplete(): void {
    if (this.calls !== this.expectedCalls) {
      this.failures.push(
        `expected ${this.expectedCalls} project-version reads, received ${this.calls}`,
      );
    }
    if (this.failures.length) throw new Error(this.failures.join("; "));
  }
}

interface ScenarioExpectation {
  readonly status: "COMPLETED" | "FAILED" | "RUNNING";
  readonly clean: boolean;
  readonly quarantine: boolean;
  readonly projectCalls: number;
  readonly rejection: "scanner" | "size" | null;
}

const expectations = {
  clean: {
    status: "COMPLETED",
    clean: true,
    quarantine: false,
    projectCalls: 1,
    rejection: null,
  },
  infected: {
    status: "FAILED",
    clean: false,
    quarantine: false,
    projectCalls: 1,
    rejection: null,
  },
  "infected-alternate": {
    status: "FAILED",
    clean: false,
    quarantine: false,
    projectCalls: 1,
    rejection: null,
  },
  malformed: {
    status: "RUNNING",
    clean: false,
    quarantine: true,
    projectCalls: 0,
    rejection: "scanner",
  },
  ambiguous: {
    status: "RUNNING",
    clean: false,
    quarantine: true,
    projectCalls: 0,
    rejection: "scanner",
  },
  unavailable: {
    status: "RUNNING",
    clean: false,
    quarantine: true,
    projectCalls: 0,
    rejection: "scanner",
  },
  closed: {
    status: "RUNNING",
    clean: false,
    quarantine: true,
    projectCalls: 0,
    rejection: "scanner",
  },
  [oversizedOverwrite]: {
    status: "FAILED",
    clean: false,
    quarantine: true,
    projectCalls: 1,
    rejection: "size",
  },
} satisfies Record<Scenario, ScenarioExpectation>;

realBoundary("real TypeScript scan and promote seam", () => {
  for (const outcome of [
    "clean",
    "infected",
    "infected-alternate",
    "malformed",
    "ambiguous",
    "unavailable",
    "closed",
    oversizedOverwrite,
  ] as const) {
    test(`preserves fail-closed database and bucket state for ${outcome}`, async () => {
      const expected = expectations[outcome];
      const database = createMutationDatabase();
      const clean = storage(required("BUCKET_NAME"), false);
      const quarantine = storage(required("QUARANTINE_BUCKET_NAME"), true);
      const projectId = crypto.randomUUID();
      const fileId = crypto.randomUUID();
      const filename = "qualification.pdf";
      const bucketPath = `ts-promote-${outcome}-${fileId}/${filename}`;
      const scanner = (
        outcome === oversizedOverwrite
          ? new StrictScannerFake()
          : new StrictScannerFake({ outcome, body: exactBytes })
      ).start();
      const projectVersions = new ProjectVersionFake(projectId, 0);
      const scope = testScope<DmsDatabase>(database.db);
      const fileService = new FileService(
        scope,
        projectVersions,
        clean,
        quarantine,
        true,
        exactBytes.byteLength,
      );
      const operation = new ScanAndPromoteService(
        scope,
        fileService,
        clean,
        quarantine,
        new ClamAvClient({
          enabled: true,
          baseUrl: scanner.baseUrl,
        }),
      );

      const cleanupErrors: unknown[] = [];
      try {
        await database.db.insert(files).values({
          id: fileId,
          projectId,
          projectVersion: 1,
          type: "DOCUMENT",
          filename,
          mimeType: "application/pdf",
          version: 1,
          bucketPath,
          workflowStatus: "RUNNING",
          isDeleted: false,
          isOutdated: false,
          frontendParentIds: [],
          updateType: "AUTOMATED",
        });
        await quarantine.upload(bucketPath, exactBytes, {
          contentType: "application/pdf",
          metadata: { outcome },
        });
        if (outcome === oversizedOverwrite) {
          await quarantine.upload(bucketPath, overwrittenBytes, {
            overwrite: true,
            contentType: "application/pdf",
            metadata: { outcome },
          });
        }

        const settled = await operation
          .execute({ fileId, bucketPath, filename })
          .catch((error) => error);
        if (expected.rejection === "scanner") {
          expect(settled).toBeInstanceOf(Error);
        } else if (expected.rejection === "size") {
          expect(settled).toMatchObject({ code: DmsValidationError.code });
        } else {
          expect(settled).toMatchObject({ isClean: outcome === "clean" });
        }

        const state = await readMutationProjectState(database, projectId);
        expect(state.files).toHaveLength(1);
        expect(state.files[0]?.workflowStatus).toBe(expected.status);
        expect(state.audit).toHaveLength(expected.projectCalls);
        expect(await clean.exists(bucketPath)).toBe(expected.clean);
        expect(await quarantine.exists(bucketPath)).toBe(expected.quarantine);
        if (expected.clean) {
          expect((await clean.download(bucketPath, exactBytes.byteLength)).bytes).toEqual(
            exactBytes,
          );
          expect((await clean.head(bucketPath)).metadata).toMatchObject({
            outcome,
            "file-id": fileId,
            "project-version": "1",
          });
        }
      } finally {
        for (const action of [
          () =>
            clean
              .exists(bucketPath)
              .then((exists) => (exists ? clean.delete(bucketPath) : undefined)),
          () =>
            quarantine
              .exists(bucketPath)
              .then((exists) => (exists ? quarantine.delete(bucketPath) : undefined)),
          () => cleanupMutationProjects(database, [projectId]),
        ]) {
          try {
            await action();
          } catch (error) {
            cleanupErrors.push(error);
          }
        }
        scanner.stop();
        try {
          scanner.assertComplete();
          projectVersions.assertComplete();
          await assertMutationProjectsAbsent(database, [projectId]);
        } catch (error) {
          cleanupErrors.push(error);
        }
        clean.close();
        quarantine.close();
        await database.client.close().catch((error) => cleanupErrors.push(error));
      }
      if (cleanupErrors.length) {
        throw new AggregateError(cleanupErrors, `scan/promote ${outcome} cleanup failed`);
      }
    });
  }
});
