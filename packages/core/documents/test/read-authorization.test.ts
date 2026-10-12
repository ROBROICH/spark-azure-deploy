import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { createFeatureHttp } from "@spark-workflow/http-host";
import {
  createPostgresRuntime,
  PostgreSQL,
  type PostgresResourceRuntime,
} from "@spark-workflow/postgres-runtime";
import { machineHeaders, useStrictAuthentication } from "@spark-workflow/test-support/strict-auth";
import { inArray } from "drizzle-orm";

import { coreFeature } from "../../src/manifest.ts";
import { coreSchema } from "../../src/schema.ts";
import { files, zipFiles } from "../src/db/schema.ts";
import { parseDocumentCommandConfiguration, parseDocumentConfiguration } from "../src/env.ts";
import { createDocumentsRoutes } from "../src/index.ts";
import { DocumentRuntime } from "../src/runtime.ts";
import { DocumentTemporalCommandsService } from "../src/temporal/commands.ts";

const databaseUrl = process.env.DMS_MUTATION_DATABASE_URL;
const member = "7b000000-0000-4000-8000-00000000000a";
const stranger = "7b000000-0000-4000-8000-00000000000b";
const admin = "7b000000-0000-4000-8000-00000000000c";
const memberProject = crypto.randomUUID();
const otherProject = crypto.randomUUID();
const memberFile = crypto.randomUUID();
const otherFile = crypto.randomUUID();
const globalFile = crypto.randomUUID();
const memberZip = crypto.randomUUID();
const olderMemberZip = crypto.randomUUID();
const otherZip = crypto.randomUUID();
const run = crypto.randomUUID();

const fileReads = (file: string) => [
  `/v2/files/${file}?projectVersion=1`,
  `/v2/files/${file}/versions`,
  `/v2/files/${file}/generate-download-url?projectVersion=1`,
];
const zipReads = (zip: string) => [
  `/v2/zip-files/${zip}`,
  `/v2/files/${zip}/approval-status`,
  `/v2/files/${zip}/diff`,
];

describe.skipIf(databaseUrl === undefined)("document reads through the owning project", () => {
  let database: PostgresResourceRuntime<typeof coreSchema>;
  let documents: DocumentRuntime;
  let app: { handle(request: Request): Promise<Response> };
  let users: Awaited<ReturnType<typeof useStrictAuthentication>>;
  let storage: ReturnType<typeof Bun.serve>;

  const get = async (path: string, headers: Record<string, string>) => {
    const response = await app.handle(new Request(`http://localhost${path}`, { headers }));
    return { status: response.status, body: await response.text() };
  };
  const listedIds = async (path: string, headers: Record<string, string>) =>
    (JSON.parse((await get(path, headers)).body) as { id: string }[]).map(({ id }) => id);

  beforeAll(async () => {
    users = await useStrictAuthentication([`${member} read project:${memberProject}`]);
    storage = Bun.serve({
      port: 0,
      fetch: () => new Response(null, { headers: { "content-type": "application/pdf" } }),
    });
    database = createPostgresRuntime({
      url: databaseUrl!,
      schema: coreSchema,
      pool: {
        maxConnections: 2,
        idleTimeoutSeconds: 30,
        connectionTimeoutSeconds: 5,
        maxLifetimeSeconds: 120,
        closeTimeoutSeconds: 5,
      },
    });
    documents = new DocumentRuntime(
      database,
      parseDocumentConfiguration({
        ENV: "local",
        CLAMAV_ENABLED: "false",
        CLAMAV_BASE_URL: "http://127.0.0.1:1",
        BUCKET_NAME: "dms-read-authorization",
        S3_ACCESS_KEY_ID: "test",
        S3_SECRET_ACCESS_KEY: "test",
        S3_ENDPOINT_URL: storage.url.origin,
        S3_EXTERNAL_URL: storage.url.origin,
        S3_REGION: "eu-west-1",
        MAX_OBJECT_SIZE_MB: "1",
      }),
      new DocumentTemporalCommandsService(
        parseDocumentCommandConfiguration({
          TEMPORAL_HOST: "127.0.0.1:1",
          TEMPORAL_NAMESPACE: "default",
        }),
      ),
    );
    const http = createFeatureHttp({
      get: async (resource) => (resource === PostgreSQL ? database : documents) as never,
      ready: async () => undefined,
      close: async () => undefined,
    }).for(coreFeature);
    app = createDocumentsRoutes(http);
    await database.query(async (client) => {
      await client.insert(files).values(
        [
          [memberFile, memberProject, "DOCUMENT"],
          [otherFile, otherProject, "DOCUMENT"],
          [globalFile, null, "TEMPLATE"],
        ].map(([id, projectId, type]) => ({
          id: id!,
          projectId,
          type: type as "DOCUMENT" | "TEMPLATE",
          filename: `${run}-${id}.pdf`,
          bucketPath: `documents/${run}/${id}.pdf`,
          mimeType: "application/pdf",
          isDeleted: false,
        })),
      );
      await client.insert(zipFiles).values(
        [
          { id: memberZip, projectId: memberProject },
          {
            id: olderMemberZip,
            projectId: memberProject,
            createdAt: new Date(Date.now() - 60_000),
          },
          { id: otherZip, projectId: otherProject },
        ].map((zip) => ({
          ...zip,
          filename: `${run}-${zip.id}.zip`,
          bucketPath: `zips/${run}/${zip.id}.zip`,
          isDeleted: false,
          workflowStatus: "REQUIRES_APPROVAL" as const,
          approvalStatus: "REQUIRES_APPROVAL" as const,
        })),
      );
    });
  });

  afterAll(async () => {
    await database.query(async (client) => {
      await client.delete(files).where(inArray(files.id, [memberFile, otherFile, globalFile]));
      await client
        .delete(zipFiles)
        .where(inArray(zipFiles.id, [memberZip, olderMemberZip, otherZip]));
    });
    await documents.close();
    await database.close();
    storage.stop(true);
    users.stop();
    mock.restore();
  });

  test("denies an unrelated USER every read and signed URL of another project's files", async () => {
    const headers = await users.userToken(stranger, ["user"]);
    for (const path of [...fileReads(otherFile), ...zipReads(otherZip)]) {
      expect((await get(path, headers)).status, path).toBe(403);
    }
  });

  test("lists only the caller's readable projects when no projectId is given", async () => {
    const headers = await users.userToken(member, ["user"]);
    const listed = await listedIds(
      `/v2/files?fileType=document&projectVersion=1&name=${run}`,
      headers,
    );
    expect(listed).toEqual([memberFile]);
    const zips = await listedIds("/v2/zip-files?projectVersion=1&pageSize=500", headers);
    expect(zips).toContain(memberZip);
    expect(zips).not.toContain(otherZip);

    const adminHeaders = await users.userToken(admin, ["admin"]);
    const adminListed = await listedIds(
      `/v2/files?fileType=document&projectVersion=1&name=${run}`,
      adminHeaders,
    );
    expect(adminListed.toSorted()).toEqual([memberFile, otherFile].toSorted());
    const adminZips = await listedIds("/v2/zip-files?projectVersion=1&pageSize=500", adminHeaders);
    expect(adminZips).toEqual(expect.arrayContaining([memberZip, otherZip]));
  });

  test("scopes a requested projectId on every page for a caller who reads every project", async () => {
    const headers = await users.userToken(admin, ["admin"]);
    expect(
      await listedIds(`/v2/zip-files?projectVersion=1&projectId=${crypto.randomUUID()}`, headers),
    ).toEqual([]);
    const pages = await Promise.all(
      [1, 2, 3].map((page) =>
        listedIds(
          `/v2/zip-files?projectVersion=1&projectId=${memberProject}&page=${page}&pageSize=1`,
          headers,
        ),
      ),
    );
    expect(pages.map((ids) => ids.length)).toEqual([1, 1, 0]);
    expect(pages.flat().toSorted()).toEqual([memberZip, olderMemberZip].toSorted());
  });

  test("intersects a requested projectId with the caller's readable projects", async () => {
    const headers = await users.userToken(member, ["user"]);
    const own = await listedIds(
      `/v2/zip-files?projectVersion=1&projectId=${memberProject}`,
      headers,
    );
    expect(own.toSorted()).toEqual([memberZip, olderMemberZip].toSorted());
    expect(
      await listedIds(`/v2/zip-files?projectVersion=1&projectId=${otherProject}`, headers),
    ).toEqual([]);
  });

  test("admits a project member to its own files", async () => {
    const headers = await users.userToken(member, ["user"]);
    for (const path of [...fileReads(memberFile), ...zipReads(memberZip)]) {
      expect((await get(path, headers)).status, path).toBe(200);
    }
  });

  test("keeps files without a project to admin and service", async () => {
    const path = `/v2/files/${globalFile}?projectVersion=1`;
    expect((await get(path, await users.userToken(member, ["user"]))).status).toBe(403);
    expect((await get(path, await users.userToken(admin, ["admin"]))).status).toBe(200);
    expect((await get(path, machineHeaders)).status).toBe(200);
  });

  test("lets admin and service read any project's files", async () => {
    const adminHeaders = await users.userToken(admin, ["admin"]);
    for (const path of [...fileReads(otherFile), ...zipReads(otherZip)]) {
      expect((await get(path, adminHeaders)).status, path).toBe(200);
      expect((await get(path, machineHeaders)).status, path).toBe(200);
    }
  });
});
