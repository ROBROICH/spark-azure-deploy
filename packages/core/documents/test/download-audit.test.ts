import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { authentication } from "@spark-workflow/authentification";
import { createHttpHost } from "@spark-workflow/http-host";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import {
  machineHeaders,
  machineSubject,
  useStrictAuthentication,
} from "@spark-workflow/test-support/strict-auth";
import { eq, inArray } from "drizzle-orm";
import { initLogger } from "evlog";
import { clearMemoryLogs, createMemoryDrain, readMemoryLogs } from "evlog/memory";

import { coreSchema } from "../../src/schema.ts";
import { projectHistory, projects } from "../../projects/src/db/schema.ts";
import { fileHistory, files } from "../src/db/schema.ts";
import { parseDocumentCommandConfiguration, parseDocumentConfiguration } from "../src/env.ts";
import { createFileRoutes } from "../src/routes/files.ts";
import { DocumentRuntime } from "../src/runtime.ts";
import { dmsModels } from "../src/schemas.ts";
import { DocumentTemporalCommandsService } from "../src/temporal/commands.ts";

process.env.EVLOG_SILENT = "0";
const databaseUrl = process.env.DMS_MUTATION_DATABASE_URL;
const actorUserId = "5d000000-0000-4000-8000-000000000001";
const strangerId = "5d000000-0000-4000-8000-000000000002";
const schema = { ...coreSchema, auditLogs };

describe.skipIf(databaseUrl === undefined)("download URL audit ownership", () => {
  const projectId = crypto.randomUUID();
  const fileIds = {
    project: crypto.randomUUID(),
    global: crypto.randomUUID(),
    pending: crypto.randomUUID(),
  };
  const store = `download-audit-${crypto.randomUUID()}`;
  const secretAccessKey = `signing-secret-${crypto.randomUUID()}`;
  const lifetime = new AsyncDisposableStack();
  let database: PostgresResourceRuntime<typeof schema>;
  let users: {
    stop(): void;
    userToken(subject: string, roles: readonly string[]): Promise<{ authorization: string }>;
  };
  let app: { handle(request: Request): Promise<Response> };

  beforeAll(async () => {
    await using setup = new AsyncDisposableStack();
    setup.defer(() => {
      mock.restore();
      clearMemoryLogs(store);
    });
    users = setup.adopt(
      await useStrictAuthentication([`${actorUserId} read project:${projectId}`]),
      (users) => users.stop(),
    );
    const storage = setup.adopt(
      Bun.serve({
        port: 0,
        fetch: () =>
          new Response("audit document", { headers: { "content-type": "application/pdf" } }),
      }),
      (storage) => storage.stop(true),
    );
    database = setup.adopt(
      createPostgresRuntime({
        url: databaseUrl!,
        schema,
        pool: {
          maxConnections: 4,
          idleTimeoutSeconds: 5,
          connectionTimeoutSeconds: 5,
          maxLifetimeSeconds: 60,
          closeTimeoutSeconds: 5,
        },
      }),
      (database) => database.close(),
    );
    await database.ready();
    const commands = setup.adopt(
      new DocumentTemporalCommandsService(parseDocumentCommandConfiguration(process.env)),
      (commands) => commands.close(),
    );
    const documents = setup.adopt(
      new DocumentRuntime(
        database,
        parseDocumentConfiguration({
          ...process.env,
          ENV: "local",
          CLAMAV_ENABLED: "false",
          BUCKET_NAME: "download-audit",
          S3_ACCESS_KEY_ID: "audit-signer",
          S3_SECRET_ACCESS_KEY: secretAccessKey,
          S3_ENDPOINT_URL: storage.url.origin,
          S3_EXTERNAL_URL: storage.url.origin,
          S3_REGION: "eu-west-1",
          MAX_OBJECT_SIZE_MB: "1",
        }),
        commands,
      ),
      (documents) => documents.close(),
    );
    app = createFileRoutes(
      createHttpHost("download-audit-test")
        .use(authentication)
        .use(dmsModels)
        .decorate("documentRuntime", documents),
    );
    initLogger({ enabled: true, silent: true, drain: createMemoryDrain({ store }) });
    await database.query(async (query) => {
      await query.insert(projects).values({ id: projectId, createdById: actorUserId });
      await query.insert(files).values(
        Object.entries(fileIds).map(([kind, id]) => ({
          id,
          projectId: kind === "global" ? null : projectId,
          type: kind === "global" ? ("TEMPLATE" as const) : ("DOCUMENT" as const),
          filename: `${id}.pdf`,
          bucketPath: `${id}.pdf`,
          mimeType: "application/pdf",
          isDeleted: false,
          workflowStatus: kind === "pending" ? ("PENDING" as const) : null,
        })),
      );
    });
    lifetime.use(setup.move());
  });

  afterAll(async () => {
    await using _resources = lifetime;
    await database.query(async (query) => {
      await query.delete(files).where(inArray(files.id, Object.values(fileIds)));
      await query.delete(fileHistory).where(inArray(fileHistory.id, Object.values(fileIds)));
      await query.delete(auditLogs).where(inArray(auditLogs.entityId, Object.values(fileIds)));
      await query.delete(projects).where(eq(projects.id, projectId));
      await query.delete(projectHistory).where(eq(projectHistory.id, projectId));
    });
  });

  const get = (fileId: string, headers: Record<string, string>) =>
    app.handle(
      new Request(`http://localhost/v2/files/${fileId}/generate-download-url?projectVersion=1`, {
        headers,
      }),
    );
  const auditRows = () =>
    database.query((query) =>
      query
        .select()
        .from(auditLogs)
        .where(inArray(auditLogs.entityId, Object.values(fileIds))),
    );

  test("project download issues one attributed audit without disclosing the signed URL", async () => {
    clearMemoryLogs(store);
    const response = await get(fileIds.project, {
      ...(await users.userToken(actorUserId, ["user"])),
      "x-actor-user-id": strangerId,
    });
    expect(response.status).toBe(200);
    const { downloadUrl } = (await response.json()) as { downloadUrl: string };
    expect(new URL(downloadUrl).searchParams.has("X-Amz-Signature")).toBeTrue();
    const rows = await auditRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      projectId,
      entityId: fileIds.project,
      entityType: "file",
      changeType: "action",
      actionType: "download_url_issued",
      actorUserId,
    });
    const recorded = JSON.stringify({ rows, events: readMemoryLogs({ store }) });
    expect(recorded).not.toContain(downloadUrl);
    expect(recorded).not.toContain("X-Amz-Signature");
    expect(recorded).not.toContain(secretAccessKey);
  });

  test("global download emits one native file audit for each authorized admin or service issuance", async () => {
    clearMemoryLogs(store);
    const urls: string[] = [];
    for (const headers of [await users.userToken(actorUserId, ["admin"]), machineHeaders]) {
      const response = await get(fileIds.global, headers);
      expect(response.status).toBe(200);
      urls.push(((await response.json()) as { downloadUrl: string }).downloadUrl);
    }
    const events = readMemoryLogs({ store });
    const audits = events.flatMap((event) => (event.audit === undefined ? [] : [event.audit]));
    expect(audits).toHaveLength(2);
    expect(audits).toMatchObject([
      {
        action: "document-management.DOWNLOAD_URL_ISSUED",
        actor: { id: actorUserId },
        target: { type: "file", id: fileIds.global },
        outcome: "success",
      },
      {
        action: "document-management.DOWNLOAD_URL_ISSUED",
        actor: { id: machineSubject },
        target: { type: "file", id: fileIds.global },
        outcome: "success",
      },
    ]);
    expect((await auditRows()).filter((row) => row.entityId === fileIds.global)).toEqual([]);
    for (const url of urls) expect(JSON.stringify(events)).not.toContain(url);
    expect(JSON.stringify(events)).not.toContain("X-Amz-Signature");
    expect(JSON.stringify(events)).not.toContain(secretAccessKey);
  });

  test("denied and unvalidated downloads issue neither a URL nor a success audit", async () => {
    clearMemoryLogs(store);
    const before = await auditRows();
    const denied = await get(fileIds.project, await users.userToken(strangerId, ["user"]));
    const globalDenied = await get(fileIds.global, await users.userToken(actorUserId, ["user"]));
    const pending = await get(fileIds.pending, await users.userToken(actorUserId, ["user"]));
    expect(denied.status).toBe(403);
    expect(globalDenied.status).toBe(403);
    expect(pending.status).toBe(409);
    for (const response of [denied, globalDenied, pending])
      expect(await response.text()).not.toContain("X-Amz-Signature");
    expect(await auditRows()).toEqual(before);
    expect(
      readMemoryLogs({ store }).flatMap((event) =>
        event.audit === undefined ? [] : [event.audit],
      ),
    ).toEqual([]);
  });
});
