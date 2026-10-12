import { describe, expect, test } from "bun:test";
import { InvalidRestQueryError } from "@spark-workflow/http-host";
import { Elysia, status } from "elysia";
import { EvlogError } from "evlog";

import {
  createUsecase,
  createUsecaseCatalogRoutes,
  createUsecaseV2Routes,
  deleteUsecase,
  getUsecase,
  listCatalog,
  updateUsecase,
  type UsecasesService,
  type UsecaseUpdate,
  type UsecaseWrite,
} from "../src/index.ts";
import {
  ALPHA,
  BETA,
  MISSING,
  UNKNOWN_PARENT,
  memoryCatalog,
  type MemoryCatalog,
  nodeId,
  usecaseWrite,
} from "./memory.ts";

process.env.AUTH_MODE = "disabled";

const serviceFor = (db: MemoryCatalog): UsecasesService => ({
  list: () => listCatalog(db),
  getUsecase: (usecaseId) => getUsecase(db, usecaseId),
  create: (input) => createUsecase(db, input),
  update: (usecaseId, input) =>
    db.transact(async () => {
      const result = await updateUsecase(db, usecaseId, input);
      if (result.isErr()) throw result.error;
      return result;
    }),
  delete: (usecaseId) =>
    db.transact(async () => {
      const result = await deleteUsecase(db, usecaseId);
      if (result.isErr()) throw result.error;
      return result;
    }),
});

const appFor = (db: MemoryCatalog) =>
  createUsecaseCatalogRoutes(
    new Elysia({ normalize: false }).onError(({ error }) => {
      if (EvlogError.isEvlogError(error)) return status(error.status, { detail: error.message });
      if (error instanceof InvalidRestQueryError) return status(400, { detail: error.message });
    }),
    () => serviceFor(db),
  );

const v2AppFor = (db: MemoryCatalog) =>
  createUsecaseV2Routes(
    new Elysia({ normalize: false }).onError(({ error }) => {
      if (EvlogError.isEvlogError(error)) return status(error.status, { detail: error.message });
      if (error instanceof InvalidRestQueryError) return status(400, { detail: error.message });
    }),
    () => serviceFor(db),
  );

const request = async (
  app: ReturnType<typeof appFor>,
  method: string,
  path: string,
  body?: UsecaseWrite | UsecaseUpdate,
) => {
  const response = await app.handle(
    new Request(`http://catalog.test${path}`, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  );
  const text = await response.text();
  return {
    status: response.status,
    body: text === "" ? undefined : JSON.parse(text),
  };
};

describe("catalog HTTP", () => {
  test("lists, creates, reads, and updates a usecase", async () => {
    const app = appFor(memoryCatalog());
    const empty = await request(app, "GET", "/catalog/usecases");
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ usecases: [] });

    const created = await request(app, "POST", "/catalog/usecases", usecaseWrite(ALPHA, "Alpha"));
    expect(created.status).toBe(201);
    expect(created.body).toEqual({
      slug: ALPHA,
      ...usecaseWrite(ALPHA, "Alpha"),
      updatedAt: expect.any(String),
    });

    const listed = await request(app, "GET", "/catalog/usecases");
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({
      usecases: [
        {
          slug: ALPHA,
          ...usecaseWrite(ALPHA, "Alpha"),
          updatedAt: created.body.updatedAt,
        },
      ],
    });

    const got = await request(app, "GET", `/catalog/usecases/${ALPHA}`);
    expect(got.status).toBe(200);
    expect(got.body).toEqual({
      slug: ALPHA,
      ...usecaseWrite(ALPHA, "Alpha"),
      updatedAt: created.body.updatedAt,
    });

    const updated = await request(app, "PUT", `/catalog/usecases/${ALPHA}`, {
      ...usecaseWrite(ALPHA, "Renamed"),
      updatedAt: created.body.updatedAt,
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({
      projekttyp: { name: "Renamed" },
      updatedAt: expect.any(String),
    });
    expect(updated.body.updatedAt).not.toBe(created.body.updatedAt);
    const reread = await request(app, "GET", `/catalog/usecases/${ALPHA}`);
    expect(reread.body).toMatchObject({
      projekttyp: { name: "Renamed" },
      updatedAt: updated.body.updatedAt,
    });
  });

  test("rejects a stale catalog update and preserves the newer write", async () => {
    const app = appFor(memoryCatalog());
    await request(app, "POST", "/catalog/usecases", usecaseWrite(ALPHA, "Alpha"));

    const current = await request(app, "GET", `/catalog/usecases/${ALPHA}`);
    const firstUpdate = await request(app, "PUT", `/catalog/usecases/${ALPHA}`, {
      ...usecaseWrite(ALPHA, "First update"),
      updatedAt: current.body.updatedAt,
    });
    expect(firstUpdate.status).toBe(200);

    const staleUpdate = await request(app, "PUT", `/catalog/usecases/${ALPHA}`, {
      ...usecaseWrite(ALPHA, "Stale update"),
      updatedAt: current.body.updatedAt,
    });
    expect(staleUpdate.status).toBe(409);
    expect(staleUpdate.body).toMatchObject({ detail: expect.stringMatching(/changed/) });

    const reread = await request(app, "GET", `/catalog/usecases/${ALPHA}`);
    expect(reread.body).toMatchObject({
      projekttyp: { name: "First update" },
      updatedAt: firstUpdate.body.updatedAt,
    });
  });

  test("rolls back a catalog update when replacement rows cannot be inserted", async () => {
    const db = memoryCatalog();
    const app = appFor(db);
    await request(app, "POST", "/catalog/usecases", usecaseWrite(ALPHA, "Alpha"));
    const current = await request(app, "GET", `/catalog/usecases/${ALPHA}`);

    db.failNextCreate();
    const failed = await request(app, "PUT", `/catalog/usecases/${ALPHA}`, {
      ...usecaseWrite(ALPHA, "Lost update"),
      updatedAt: current.body.updatedAt,
    });

    expect(failed.status).toBe(500);
    const reread = await request(app, "GET", `/catalog/usecases/${ALPHA}`);
    expect(reread.body).toMatchObject({
      projekttyp: { name: "Alpha" },
      updatedAt: current.body.updatedAt,
    });
  });

  test("requires the optimistic update guard", async () => {
    const app = appFor(memoryCatalog());
    await request(app, "POST", "/catalog/usecases", usecaseWrite(ALPHA, "Alpha"));

    const response = await request(
      app,
      "PUT",
      `/catalog/usecases/${ALPHA}`,
      usecaseWrite(ALPHA, "Without guard"),
    );

    expect(response.status).toBe(422);
    const reread = await request(app, "GET", `/catalog/usecases/${ALPHA}`);
    expect(reread.body).toMatchObject({ projekttyp: { name: "Alpha" } });
  });

  test("maps missing, conflict, and invalid catalog writes", async () => {
    const db = memoryCatalog();
    (await createUsecase(db, usecaseWrite(ALPHA))).unwrap();
    const app = appFor(db);

    const missingGet = await request(app, "GET", `/catalog/usecases/${MISSING}`);
    expect(missingGet.status).toBe(404);
    expect(missingGet.body).toMatchObject({ detail: expect.stringMatching(/not found/) });

    const missingPut = await request(app, "PUT", `/catalog/usecases/${MISSING}`, {
      ...usecaseWrite(MISSING),
      updatedAt: new Date(0).toISOString(),
    });
    expect(missingPut.status).toBe(404);

    const duplicate = await request(app, "POST", "/catalog/usecases", usecaseWrite(ALPHA));
    expect(duplicate.status).toBe(409);
    expect(duplicate.body).toMatchObject({ detail: expect.stringMatching(/already exists/) });

    const existing = await request(app, "GET", `/catalog/usecases/${ALPHA}`);
    const mismatch = await request(app, "PUT", `/catalog/usecases/${ALPHA}`, {
      ...usecaseWrite(BETA),
      updatedAt: existing.body.updatedAt,
    });
    expect(mismatch.status).toBe(422);
    expect(mismatch.body).toMatchObject({
      detail: expect.stringMatching(/must match the authority/),
    });

    const invalid = await request(app, "POST", "/catalog/usecases", {
      ...usecaseWrite(BETA),
      beschluss: {
        nodes: [
          {
            id: nodeId(BETA),
            parent_vae_node_id: UNKNOWN_PARENT,
            title: "Root",
            text: "",
            topic: null,
            order: 0,
            is_hidden: false,
            can_add_child: false,
          },
        ],
      },
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({ detail: expect.stringMatching(/missing parent/) });
  });

  test("rejects a non-UUID beschluss node id", async () => {
    const db = memoryCatalog();
    const app = appFor(db);
    const write = usecaseWrite(BETA);
    const created = await request(app, "POST", "/catalog/usecases", {
      ...write,
      beschluss: {
        nodes: [{ ...write.beschluss.nodes[0]!, id: "root-node" }],
      },
    });
    expect(created.status).toBe(422);
    expect((await listCatalog(db)).unwrap().usecases).toEqual([]);
  });
});

describe("v2 usecase HTTP", () => {
  test("provides paginated domain CRUD without exposing persistence rows", async () => {
    const app = v2AppFor(memoryCatalog());
    const created = await request(app, "POST", "/usecases", usecaseWrite(ALPHA, "Alpha"));
    expect(created.status).toBe(201);

    const listed = await request(app, "GET", "/usecases?limit=1");
    expect(listed.status).toBe(200);
    expect(listed.body).toEqual({
      data: [created.body],
      pagination: { page: 1, limit: 1, total: 1, nextCursor: null },
    });
    expect(listed.body).not.toHaveProperty("usecaseDocuments");

    const got = await request(app, "GET", `/usecases/${ALPHA}`);
    expect(got.status).toBe(200);
    const updated = await request(app, "PUT", `/usecases/${ALPHA}`, {
      ...usecaseWrite(ALPHA, "Renamed"),
      updatedAt: got.body.updatedAt,
    });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ projekttyp: { name: "Renamed" } });

    const deleted = await request(app, "DELETE", `/usecases/${ALPHA}`);
    expect(deleted.status).toBe(200);
    expect(deleted.body).toEqual(updated.body);
    expect((await request(app, "GET", `/usecases/${ALPHA}`)).status).toBe(404);
    expect((await app.handle(new Request("http://catalog.test/usecase-documents"))).status).toBe(
      404,
    );
  });

  test("rejects invalid identifiers, unknown queries, and persistence-shaped bodies", async () => {
    const app = v2AppFor(memoryCatalog());

    expect((await request(app, "GET", "/usecases/not-a-uuid")).status).toBe(422);
    expect((await request(app, "GET", "/usecases?unknown=value")).status).toBe(400);
    const internalBody = {
      ...usecaseWrite(ALPHA, "Alpha"),
      authorityId: ALPHA,
      type: "projekttyp",
      document: {},
    };
    expect((await request(app, "POST", "/usecases", internalBody)).status).toBe(422);
  });
});
