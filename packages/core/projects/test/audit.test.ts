import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { createFeatureHttp, createHttpHost, type HttpJson } from "@spark-workflow/http-host";
import { createPostgresRuntime, PostgreSQL, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { useStrictAuthentication } from "@spark-workflow/test-support/strict-auth";
import { composeFeatures, defineFeature, provideValue } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import { and, eq, inArray } from "drizzle-orm";
import { initLogger } from "evlog";
import { clearMemoryLogs, createMemoryDrain, readMemoryLogs } from "evlog/memory";

import { coreFeature } from "../../src/manifest.ts";
import { coreSchema } from "../../src/schema.ts";
import { DocumentConfiguration, DocumentCommandConfiguration } from "../../documents/src/resource.ts";
import { parseDocumentConfiguration, parseDocumentCommandConfiguration } from "../../documents/src/env.ts";
import { ProjectConfiguration, ProjectCommandConfiguration } from "../src/resource.ts";
import { parseProjectConfiguration, parseProjectCommandConfiguration } from "../src/env.ts";
import { createProjectV2Routes } from "../src/v2-routes.ts";
import { createUsecasesService } from "../../usecases/src/resource.ts";
import { createUsecaseV2Routes } from "../../usecases/src/routes.ts";
import type { UsecaseResponse, UsecaseWrite } from "../../usecases/src/formats.ts";
import {
  projectHistory, projectLogicSchema, projects, projectTypeHistory, projectTypes,
  topicHistory, topics, usecaseDocuments,
} from "../src/db/schema.ts";
import { createReferenceDataRoutes } from "../src/routes/reference-data.ts";
import { createTopicRoutes } from "../src/routes/topics.ts";
import { projectNodesProvider } from "../src/runtime.ts";

process.env.EVLOG_SILENT = "0";
const databaseUrl = process.env.PLS_MUTATION_DATABASE_URL;
const schema = { ...coreSchema, auditLogs };
const actorUserId = "5c000000-0000-4000-8000-000000000001";
const spoofedActor = "5c000000-0000-4000-8000-000000000002";

describe.skipIf(databaseUrl === undefined)("core mutation audit ownership", () => {
  const projectId = crypto.randomUUID();
  const usecaseId = crypto.randomUUID();
  const store = `core-audit-${crypto.randomUUID()}`;
  const ownedTypeIds: string[] = [];
  const lifetime = new AsyncDisposableStack();
  let database: PostgresResourceRuntime<typeof schema>;
  let users: {
    stop(): void;
    userToken(subject: string, roles: readonly string[]): Promise<{ authorization: string }>;
  };
  let app: { handle(request: Request): Promise<Response> };
  let headers: Headers;

  beforeAll(async () => {
    await using setup = new AsyncDisposableStack();
    setup.defer(() => {
      mock.restore();
      clearMemoryLogs(store);
    });
    users = setup.adopt(await useStrictAuthentication([
      `${actorUserId} update project:${projectId}`,
      `${actorUserId} delete project:${projectId}`,
    ]), (users) => users.stop());
    headers = new Headers(await users.userToken(actorUserId, ["admin"]));
    headers.set("content-type", "application/json");
    headers.set("x-actor-user-id", spoofedActor);
    database = setup.adopt(createPostgresRuntime({
      url: databaseUrl!, schema,
      pool: { maxConnections: 4, idleTimeoutSeconds: 5, connectionTimeoutSeconds: 5, maxLifetimeSeconds: 60, closeTimeoutSeconds: 5 },
    }), (database) => database.close());
    await database.ready();
    await database.query((query) => query.insert(projects).values({ id: projectId, createdById: actorUserId }));
    const host = createHttpHost("core-audit-test")
      .decorate("postgres", database.scope(projectLogicSchema))
      .decorate("projectNodes", await projectNodesProvider.make({ postgres: database }));
    app = createUsecaseV2Routes(createReferenceDataRoutes(createTopicRoutes(host)), ({ postgres }) => createUsecasesService(postgres));
    initLogger({ enabled: true, silent: true, drain: createMemoryDrain({ store }) });
    lifetime.use(setup.move());
  });

  afterAll(async () => {
    await using _resources = lifetime;
    await database.query(async (query) => {
      await query.delete(topics).where(eq(topics.projectId, projectId));
      await query.delete(topicHistory).where(eq(topicHistory.projectId, projectId));
      await query.delete(auditLogs).where(eq(auditLogs.projectId, projectId));
      await query.delete(projects).where(eq(projects.id, projectId));
      await query.delete(projectHistory).where(eq(projectHistory.id, projectId));
      await query.delete(usecaseDocuments).where(eq(usecaseDocuments.authorityId, usecaseId));
      if (ownedTypeIds.length > 0) {
        await query.delete(projectTypes).where(inArray(projectTypes.id, ownedTypeIds));
        await query.delete(projectTypeHistory).where(inArray(projectTypeHistory.id, ownedTypeIds));
      }
    });
  });

  const send = (method: string, path: string, body?: HttpJson) => app.handle(new Request(`http://localhost${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }));

  test("root and child topic mutations each persist one authenticated audit and failed writes persist none", async () => {
    const rootResponse = await send("POST", "/topics", { projectId, name: "Audit root" });
    expect(rootResponse.status).toBe(201);
    const root = await rootResponse.json() as { id: string };
    const childResponse = await send("POST", "/topics", { projectId, parentTopicId: root.id, name: "Audit child" });
    expect(childResponse.status).toBe(201);
    const child = await childResponse.json() as { id: string };
    expect((await send("POST", "/topics", { projectId, name: "Audit root" })).status).toBe(409);
    for (const [id, name] of [[root.id, "Audit root updated"], [child.id, "Audit child updated"]]) {
      expect((await send("PATCH", `/topics/${id}`, { name })).status).toBe(200);
    }
    for (const id of [child.id, root.id]) {
      expect((await send("DELETE", `/topics/${id}`)).status).toBe(200);
    }
    expect((await send("DELETE", `/topics/${crypto.randomUUID()}`)).status).toBe(404);
    const rows = await database.query((query) => query.select({
      entityId: auditLogs.entityId, changeType: auditLogs.changeType, actorUserId: auditLogs.actorUserId,
    }).from(auditLogs).where(and(eq(auditLogs.projectId, projectId), eq(auditLogs.entityType, "topic"))).orderBy(auditLogs.timestamp, auditLogs.id));
    expect(rows).toEqual([
      { entityId: root.id, changeType: "create", actorUserId },
      { entityId: child.id, changeType: "create", actorUserId },
      { entityId: root.id, changeType: "update", actorUserId },
      { entityId: child.id, changeType: "update", actorUserId },
      { entityId: child.id, changeType: "delete", actorUserId },
      { entityId: root.id, changeType: "delete", actorUserId },
    ]);
  });

  test("project type catalog mutations emit native attributed audit only after successful persistence", async () => {
    clearMemoryLogs(store);
    const name = `Audit project type ${crypto.randomUUID()}`;
    const createdResponse = await send("POST", "/project-types", [{ name }]);
    expect(createdResponse.status).toBe(201);
    const [created] = await createdResponse.json() as { id: string; name: string; active: boolean }[];
    ownedTypeIds.push(created!.id);
    expect((await send("PATCH", "/project-types", [{ id: created!.id, name: `${name} updated`, active: false }])).status).toBe(200);
    expect((await send("DELETE", `/project-types?ids=${created!.id}`)).status).toBe(204);
    expect((await send("DELETE", `/project-types?ids=${created!.id}`)).status).toBe(404);
    const rows = readMemoryLogs({ store }).flatMap((event) => event.audit === undefined ? [] : [event.audit]);
    expect(rows).toHaveLength(3);
    expect(rows).toMatchObject([
      { action: "project-logic.PROJECT_TYPES_CREATE", actor: { type: "user", id: actorUserId }, outcome: "success", changes: { after: [{ id: created!.id, name }] } },
      { action: "project-logic.PROJECT_TYPES_UPDATE", actor: { type: "user", id: actorUserId }, outcome: "success", changes: { after: [{ id: created!.id, active: false }] } },
      { action: "project-logic.PROJECT_TYPES_DELETE", actor: { type: "user", id: actorUserId }, outcome: "success", changes: { before: [{ id: created!.id }] } },
    ]);
    expect(await database.query((query) => query.select({ id: projectTypes.id }).from(projectTypes).where(eq(projectTypes.id, created!.id)))).toEqual([]);
  });

  test("V2 missing project-type update returns 404 without a success audit", async () => {
    const resources = makeEffectResourceRuntime(composeFeatures([
      coreFeature,
      defineFeature({
        id: "core-catalog-audit-platform",
        needs: {},
        providers: [
          provideValue(PostgreSQL, database),
          provideValue(ProjectConfiguration, parseProjectConfiguration(process.env)),
          provideValue(ProjectCommandConfiguration, parseProjectCommandConfiguration(process.env)),
          provideValue(DocumentConfiguration, parseDocumentConfiguration(process.env)),
          provideValue(DocumentCommandConfiguration, parseDocumentCommandConfiguration(process.env)),
        ],
        tables: {},
      }),
    ] as const));
    try {
      const v2 = createHttpHost("core-v2-audit-test").use(createProjectV2Routes(createFeatureHttp(resources).for(coreFeature)));
      initLogger({ enabled: true, silent: true, drain: createMemoryDrain({ store }) });
      const createdResponse = await send("POST", "/project-types", [{ name: `V2 audit ${crypto.randomUUID()}` }]);
      expect(createdResponse.status).toBe(201);
      const [created] = await createdResponse.json() as { id: string }[];
      ownedTypeIds.push(created!.id);
      clearMemoryLogs(store);
      for (const [id, expectedStatus] of [[created!.id, 200], [crypto.randomUUID(), 404]] as const) {
        const response = await v2.handle(new Request(`http://localhost/project-types/${id}`, {
          method: "PATCH", headers, body: JSON.stringify({ active: false }),
        }));
        expect(response.status).toBe(expectedStatus);
      }
      const events = readMemoryLogs({ store }).flatMap((event) => event.audit === undefined ? [] : [event.audit]);
      expect(events).toHaveLength(1);
      expect(events).toMatchObject([{
        action: "project-logic.PROJECT_TYPES_UPDATE",
        actor: { type: "user", id: actorUserId },
        outcome: "success",
        changes: { after: [{ id: created!.id, active: false }] },
      }]);
    } finally {
      await resources.close();
    }
  });

  test("usecase catalog mutations emit native attributed audit and a stale write emits no success", async () => {
    clearMemoryLogs(store);
    const input: UsecaseWrite = {
      projekttyp: { id: usecaseId, name: `Audit usecase ${usecaseId}` },
      gesetzesgrundlage: { topics: [], stateNormGroups: {}, topicStateGroups: {} },
      dokumente: { categories: [] },
      beschluss: { nodes: [{ id: crypto.randomUUID(), parent_vae_node_id: null, title: "Beschluss", text: "", topic: null, order: 1, is_hidden: false, can_add_child: true }] },
    };
    const createdResponse = await send("POST", "/usecases", input);
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json() as UsecaseResponse;
    const changed = { ...input, projekttyp: { id: usecaseId, name: `${input.projekttyp.name} updated` }, updatedAt: created.updatedAt };
    expect((await send("PUT", `/usecases/${usecaseId}`, changed)).status).toBe(200);
    expect((await send("PUT", `/usecases/${usecaseId}`, changed)).status).toBe(409);
    expect((await send("DELETE", `/usecases/${usecaseId}`)).status).toBe(200);
    const rows = readMemoryLogs({ store }).flatMap((event) => event.audit === undefined ? [] : [event.audit]);
    expect(rows).toHaveLength(3);
    expect(rows).toMatchObject([
      { action: "usecases.USECASE_CREATE", actor: { type: "user", id: actorUserId }, target: { type: "usecase", id: usecaseId }, outcome: "success" },
      { action: "usecases.USECASE_UPDATE", actor: { type: "user", id: actorUserId }, target: { type: "usecase", id: usecaseId }, outcome: "success" },
      { action: "usecases.USECASE_DELETE", actor: { type: "user", id: actorUserId }, target: { type: "usecase", id: usecaseId }, outcome: "success" },
    ]);
    expect(await database.query((query) => query.select({ authorityId: usecaseDocuments.authorityId }).from(usecaseDocuments).where(eq(usecaseDocuments.authorityId, usecaseId)))).toEqual([]);
  });
});
