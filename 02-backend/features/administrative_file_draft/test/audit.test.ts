import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { projects } from "@spark-workflow/core/projects/schema";
import type { HttpJson } from "@spark-workflow/http-host";
import { runProcess } from "@spark-workflow/test-support";
import { useStrictAuthentication } from "@spark-workflow/test-support/strict-auth";
import { eq } from "drizzle-orm";

import { risks, vaeNodes } from "../src/db/schema.ts";
import { createPostgresApp, databaseUrl } from "./support/postgres-app.ts";

process.env.EVLOG_SILENT = "0";

const describeDatabaseTests = databaseUrl === undefined ? describe.skip : describe;
const actorUserId = "5a000000-0000-4000-8000-000000000001";

describeDatabaseTests("administrative file draft writes and exports leave one attributed audit row", () => {
  const projectId = crypto.randomUUID();
  const vaeNodeId = crypto.randomUUID();
  const riskId = crypto.randomUUID();
  let harness: Awaited<ReturnType<typeof createPostgresApp>>;
  let authentication: Awaited<ReturnType<typeof useStrictAuthentication>>;

  beforeAll(async () => {
    authentication = await useStrictAuthentication([]);
    harness = await createPostgresApp(databaseUrl!);
    await harness.database.query(async (query) => {
      await query.insert(projects).values({
        id: projectId,
        createdById: actorUserId,
        name: "Audit project",
        internalProjectNumber: "AUDIT-1",
      });
      await query.insert(vaeNodes).values({ id: vaeNodeId, projectId, title: "Node", text: "Node" });
      await query.insert(risks).values({
        id: riskId,
        projectId,
        vaeNodeId,
        status: "OPEN",
        problem: "Noise",
        severity: 3,
        implication: "Delay",
      });
    });
  });

  afterAll(async () => {
    authentication.stop();
    mock.restore();
    await harness.close([projectId]);
  });

  const send = async (method: string, path: string, body?: HttpJson) =>
    harness.app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: {
          "content-type": "application/json",
          ...(await authentication.userToken(actorUserId, ["service"])),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );

  const auditRows = (entityId: string) =>
    harness.database.query((query) =>
      query
        .select({
          entityType: auditLogs.entityType,
          changeType: auditLogs.changeType,
          actionType: auditLogs.actionType,
          actorUserId: auditLogs.actorUserId,
        })
        .from(auditLogs)
        .where(eq(auditLogs.entityId, entityId))
        .orderBy(auditLogs.timestamp),
    );

  test("risk create records one create row per created risk", async () => {
    const response = await send("POST", `/risks/${projectId}`, {
      risks: [{ problem: "Glare", severity: 2, implication: "Shade", vaeNodeId }],
    });

    expect(response.status).toBe(201);
    const [created] = (await response.json()) as { id: string }[];
    expect(await auditRows(created!.id)).toEqual([
      { entityType: "risks", changeType: "create", actionType: null, actorUserId },
    ]);
  });

  test("risk update records one update row", async () => {
    const response = await send("PATCH", `/risks/${riskId}`, { severity: 4 });

    expect(response.status).toBe(200);
    expect(await auditRows(riskId)).toEqual([
      { entityType: "risks", changeType: "update", actionType: null, actorUserId },
    ]);
  });

  test("DOCX and PDF exports each record one project action", async () => {
    for (const format of ["docx", "pdf"]) {
      expect((await send("POST", `/${projectId}/export/${format}`)).status).toBe(200);
    }

    expect(await auditRows(projectId)).toEqual([
      {
        entityType: "project",
        changeType: "action",
        actionType: "administrative_file_draft_export_docx",
        actorUserId,
      },
      {
        entityType: "project",
        changeType: "action",
        actionType: "administrative_file_draft_export_pdf",
        actorUserId,
      },
    ]);
  });
});

describeDatabaseTests("Postgres fixture failure cleanup", () => {
  for (const phase of ["setup", "teardown"] as const) {
    test(`${phase} failure releases native listeners and clients`, async () => {
      const { exitCode, stdout, stderr } = await runProcess(["--eval", `
          import { createPostgresApp } from ${JSON.stringify(new URL("./support/postgres-app.ts", import.meta.url).href)};
          const url = new URL(process.env.ADMINISTRATIVE_FILE_DRAFT_DATABASE_URL);
          if (process.env.S22_FIXTURE_FAILURE === "setup") url.pathname = "/s22_absent_" + crypto.randomUUID();
          try {
            const fixture = await createPostgresApp(url.href);
            console.log("fixture acquired");
            await fixture.database.close();
            await fixture.close([]);
            process.exitCode = 1;
          } catch {
            console.log("fixture failure observed");
          }
        `], { env: { S22_FIXTURE_FAILURE: phase }, timeout: 4_000 });
      expect(stdout).toBe(phase === "setup"
        ? "fixture failure observed\n"
        : "fixture acquired\nfixture failure observed\n");
      expect(exitCode, stderr).toBe(0);
    }, 6_000);
  }
});
