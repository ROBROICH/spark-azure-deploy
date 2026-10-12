import { afterAll, beforeAll, beforeEach, describe, expect, mock, test } from "bun:test";
import { SQL } from "bun";
import { createHttpHost } from "@spark-workflow/http-host";
import { createPostgresRuntime, type PostgresResourceRuntime } from "@spark-workflow/postgres-runtime";
import { useStrictAuthentication } from "@spark-workflow/test-support/strict-auth";

import { projectLogicSchema } from "../../projects/src/db/schema.ts";
import { seedCoreDatabase } from "../../projects/src/index.ts";
import { createUsecasesService } from "../src/resource.ts";
import { createUsecaseV2Routes } from "../src/routes.ts";
import type { UsecaseResponse, UsecaseWrite } from "../src/formats.ts";
import { ALPHA, BETA, usecaseWrite } from "./memory.ts";

const databaseUrl = process.env.USECASE_TEST_DATABASE_URL;

describe.skipIf(!databaseUrl)("catalog writes in isolated PostgreSQL", () => {
  let database: PostgresResourceRuntime<typeof projectLogicSchema>;
  let control: SQL;
  let auth: Awaited<ReturnType<typeof useStrictAuthentication>>;
  let app: { handle(request: Request): Promise<Response> };
  let headers: Headers;

  beforeAll(async () => {
    const target = new URL(databaseUrl!);
    if (
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      !target.pathname.startsWith("/core_catalog_test_")
    ) {
      throw new Error(
        "USECASE_TEST_DATABASE_URL must name an isolated local core_catalog_test_ database",
      );
    }
    control = new SQL(databaseUrl!);
    database = createPostgresRuntime({
      url: databaseUrl!,
      schema: projectLogicSchema,
      pool: { maxConnections: 4 },
    });
    auth = await useStrictAuthentication([]);
    headers = new Headers(await auth.userToken(crypto.randomUUID(), ["admin"]));
    headers.set("content-type", "application/json");
    const host = createHttpHost("catalog-postgres-test").decorate(
      "postgres",
      database.scope(projectLogicSchema),
    );
    app = createUsecaseV2Routes(host, ({ postgres }) => createUsecasesService(postgres));
  });

  beforeEach(async () => {
    await control`delete from usecase_document`;
  });

  afterAll(async () => {
    await control`delete from usecase_document`;
    await database.close();
    await control.close();
    auth.stop();
    mock.restore();
  });

  const send = (method: string, body?: UsecaseWrite | UsecaseResponse, id = "") =>
    app.handle(
      new Request(`http://localhost/usecases${id ? `/${id}` : ""}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      }),
    );

  const overlap = async (first: () => Promise<Response>, second: () => Promise<Response>) => {
    let pending: Promise<Response[]>;
    await control.begin(async (blocker) => {
      await blocker`lock table usecase_document in share mode`;
      pending = Promise.all([first(), second()]);
      const deadline = Date.now() + 5_000;
      let waiting = 0;
      while (waiting < 2 && Date.now() < deadline) {
        const rows = await control`select count(*)::integer as count from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`;
        waiting = rows[0].count;
        if (waiting < 2) await Bun.sleep(10);
      }
      expect(waiting).toBe(2);
    });
    return pending!;
  };

  for (const collision of ["name", "document type", "decision node"] as const) {
    test(`concurrent authorized creates reject a duplicate ${collision}`, async () => {
      const first = usecaseWrite(ALPHA, "First");
      const second = usecaseWrite(BETA, "Second");
      if (collision === "name") second.projekttyp.name = first.projekttyp.name;
      if (collision === "decision node") second.beschluss = first.beschluss;
      if (collision === "document type") {
        const sharedType = {
          id: crypto.randomUUID(),
          name: "Map",
          description: "",
          expected_count: null,
        };
        first.dokumente.categories = [
          { id: crypto.randomUUID(), category: "First", document_types: [sharedType] },
        ];
        second.dokumente.categories = [
          { id: crypto.randomUUID(), category: "Second", document_types: [sharedType] },
        ];
      }
      const responses = await overlap(
        () => send("POST", first),
        () => send("POST", second),
      );
      expect(responses.map(({ status }) => status).sort()).toEqual([201, 422]);
      expect((await send("GET")).status).toBe(200);
      await seedCoreDatabase(database);
      expect(
        (await control`select count(*)::integer as count from usecase_document`)[0].count,
      ).toBe(4);
    });
  }

  for (const createSecond of [false, true]) {
    test(`overlapping ${createSecond ? "POST/PUT" : "PUT/PUT"} keeps global names unique`, async () => {
      const first = (await (
        await send("POST", usecaseWrite(ALPHA, "First"))
      ).json()) as UsecaseResponse;
      const second = createSecond
        ? usecaseWrite(BETA, "Second")
        : ((await (await send("POST", usecaseWrite(BETA, "Second"))).json()) as UsecaseResponse);
      first.projekttyp.name = "Collision";
      second.projekttyp.name = "Collision";
      const responses = await overlap(
        () => send("PUT", first, ALPHA),
        () => send(createSecond ? "POST" : "PUT", second, createSecond ? "" : BETA),
      );
      expect(responses.filter(({ status }) => status === 200 || status === 201)).toHaveLength(1);
      expect(responses.filter(({ status }) => status === 422)).toHaveLength(1);
      expect((await send("GET")).status).toBe(200);
    });
  }

  test("same-authority writes retain revision conflicts and replacement rollback", async () => {
    const original = (await (
      await send("POST", usecaseWrite(ALPHA, "Original"))
    ).json()) as UsecaseResponse;
    const updated = { ...original, projekttyp: { ...original.projekttyp, name: "Updated" } };
    const responses = await Promise.all([send("PUT", updated, ALPHA), send("PUT", updated, ALPHA)]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 409]);
    const current = (await (await send("GET", undefined, ALPHA)).json()) as UsecaseResponse;
    await control`alter table usecase_document add constraint catalog_test_reject_insert check (document->>'name' is distinct from 'Rejected insert')`;
    try {
      const rejected = {
        ...current,
        projekttyp: { ...current.projekttyp, name: "Rejected insert" },
      };
      expect((await send("PUT", rejected, ALPHA)).status).toBe(500);
      expect(await (await send("GET", undefined, ALPHA)).json()).toEqual(current);
      expect(
        (
          await control`select count(*)::integer as count from usecase_document where authority_id = ${ALPHA}`
        )[0].count,
      ).toBe(4);
    } finally {
      await control`alter table usecase_document drop constraint catalog_test_reject_insert`;
    }
  });

  for (const existing of [false, true]) {
    test(`seed sees a waiting writer commit with an ${existing ? "existing" : "empty"} catalog`, async () => {
      if (existing)
        (
          await createUsecasesService(database.scope(projectLogicSchema)).create(
            usecaseWrite(BETA, "Existing"),
          )
        ).unwrap();
      const holding = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const writer = control.begin(async (transaction) => {
        await transaction`select pg_advisory_xact_lock(hashtextextended('core/usecases/catalog', 0))`;
        const write = usecaseWrite(ALPHA, "Editor");
        for (const type of ["projekttyp", "gesetzesgrundlage", "dokumente", "beschluss"] as const) {
          await transaction`insert into usecase_document (authority_id, type, document) values (${ALPHA}, ${type}, ${JSON.stringify(write[type])}::jsonb)`;
        }
        holding.resolve();
        await release.promise;
      });
      await holding.promise;
      const seed = seedCoreDatabase(database);
      try {
        const deadline = Date.now() + 5_000;
        let waiting = 0;
        while (waiting === 0 && Date.now() < deadline) {
          const rows = await control`select count(*)::integer as count from pg_stat_activity
          where datname = current_database() and wait_event_type = 'Lock'`;
          waiting = rows[0].count;
          if (waiting === 0) await Bun.sleep(10);
        }
        expect(waiting).toBe(1);
      } finally {
        release.resolve();
        await Promise.all([writer, seed]);
      }
      const catalog = (
        await createUsecasesService(database.scope(projectLogicSchema)).list()
      ).unwrap();
      expect(catalog.usecases.map(({ projekttyp }) => projekttyp.name).sort()).toEqual(
        existing ? ["Editor", "Existing"] : ["Editor"],
      );
    });
  }

  test("invalid historical catalog stays visible as an error and can be explicitly deleted", async () => {
    for (const write of [usecaseWrite(ALPHA, "Duplicate"), usecaseWrite(BETA, "Duplicate")]) {
      await control.begin(async (transaction) => {
        for (const type of ["projekttyp", "gesetzesgrundlage", "dokumente", "beschluss"] as const) {
          await transaction`insert into usecase_document (authority_id, type, document) values (${write.projekttyp.id}, ${type}, ${JSON.stringify(write[type])}::jsonb)`;
        }
      });
    }
    expect((await send("GET")).status).toBe(422);
    expect((await send("GET", undefined, ALPHA)).status).toBe(200);
    await expect(seedCoreDatabase(database)).rejects.toThrow("duplicate projekttyp name");
    expect((await send("DELETE", undefined, BETA)).status).toBe(200);
    expect((await send("GET")).status).toBe(200);
  });
});
