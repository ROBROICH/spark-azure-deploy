import { describe, expect, test } from "bun:test";
import type { Result } from "better-result";
import { EvlogError } from "evlog";

import {
  catalogFromRows,
  createUsecase,
  defaultUsecaseDirectory,
  getUsecase,
  listCatalog,
  loadUsecases,
  seedUsecaseCatalog,
  toUsecaseDocumentRows,
  updateUsecase,
} from "../src/index.ts";
import {
  ALPHA,
  BETA,
  EDITOR,
  GAMMA,
  MISSING,
  OTHER,
  UNKNOWN_PARENT,
  memoryCatalog,
  nodeId,
  usecaseWrite,
} from "./memory.ts";

const expectError = (result: Result<unknown, EvlogError>, pattern: RegExp) => {
  expect(result.status).toBe("error");
  if (result.status === "error") {
    expect(EvlogError.isEvlogError(result.error)).toBe(true);
    expect(result.error.message).toMatch(pattern);
  }
};

describe("catalogFromRows", () => {
  test("rebuilds a catalog from usecase_document rows and uses authority id as slug", async () => {
    const loaded = (await loadUsecases({ directory: defaultUsecaseDirectory() })).unwrap();
    const restored = catalogFromRows(toUsecaseDocumentRows(loaded)).unwrap();
    const original = loaded.usecases[0]!;
    const usecase = restored.usecases[0]!;
    expect(usecase.slug).toBe(original.projekttyp.id);
    expect(usecase.projekttyp).toEqual(original.projekttyp);
    expect(usecase.gesetzesgrundlage).toEqual(original.gesetzesgrundlage);
    expect(usecase.dokumente).toEqual(original.dokumente);
    expect(usecase.beschluss).toEqual(original.beschluss);
  });

  test("rejects an incomplete or unknown document type", () => {
    const write = usecaseWrite(ALPHA);
    expectError(
      catalogFromRows([
        { authorityId: ALPHA, type: "projekttyp", document: write.projekttyp },
        { authorityId: ALPHA, type: "dokumente", document: write.dokumente },
        { authorityId: ALPHA, type: "beschluss", document: write.beschluss },
      ]),
      /missing gesetzesgrundlage/,
    );
    expectError(
      catalogFromRows([{ authorityId: ALPHA, type: "notes", document: {} }]),
      /unknown/,
    );
  });
});

describe("catalog writes", () => {
  test("creates, reads, updates, and lists an authority", async () => {
    const db = memoryCatalog();
    const created = (await createUsecase(db, usecaseWrite(ALPHA, "Alpha"))).unwrap();
    expect(created.slug).toBe(ALPHA);
    expect((await getUsecase(db, ALPHA)).unwrap().projekttyp.name).toBe("Alpha");
    expect((await listCatalog(db)).unwrap().usecases.map((usecase) => usecase.projekttyp.id)).toEqual([
      ALPHA,
    ]);

    const updated = (
      await updateUsecase(db, ALPHA, {
        ...usecaseWrite(ALPHA, "Renamed"),
        updatedAt: created.updatedAt,
        beschluss: {
          nodes: [
            {
              id: nodeId(ALPHA),
              parent_vae_node_id: null,
              title: "Updated",
              text: "",
              topic: null,
              order: 0,
              is_hidden: false,
              can_add_child: false,
            },
          ],
        },
      })
    ).unwrap();
    expect(updated.projekttyp.name).toBe("Renamed");
    expect((await getUsecase(db, ALPHA)).unwrap().beschluss.nodes[0]!.title).toBe("Updated");
  });

  test("rejects duplicate create, missing get/update, and identity changes", async () => {
    const db = memoryCatalog();
    const created = (await createUsecase(db, usecaseWrite(ALPHA))).unwrap();

    expectError(await createUsecase(db, usecaseWrite(ALPHA)), /already exists/);
    expectError(await getUsecase(db, MISSING), /not found/);
    expectError(
      await updateUsecase(db, MISSING, {
        ...usecaseWrite(MISSING),
        updatedAt: new Date(0).toISOString(),
      }),
      /not found/,
    );
    expectError(
      await updateUsecase(db, ALPHA, {
        ...usecaseWrite(BETA),
        updatedAt: created.updatedAt,
      }),
      /must match the authority/,
    );
    expectError(
      await createUsecase(db, { ...usecaseWrite(BETA), slug: OTHER }),
      /slug must match/,
    );
  });

  test("rejects a write that breaks catalog validation", async () => {
    const db = memoryCatalog();
    const created = (await createUsecase(db, usecaseWrite(ALPHA, "Alpha"))).unwrap();
    expectError(
      await createUsecase(db, {
        ...usecaseWrite(BETA),
        beschluss: {
          nodes: [
            {
              id: nodeId(ALPHA),
              parent_vae_node_id: null,
              title: "Root",
              text: "",
              topic: null,
              order: 0,
              is_hidden: false,
              can_add_child: false,
            },
          ],
        },
      }),
      /duplicate id/,
    );
    expectError(
      await updateUsecase(db, ALPHA, {
        ...usecaseWrite(ALPHA, "Alpha"),
        updatedAt: created.updatedAt,
        beschluss: {
          nodes: [
            {
              id: nodeId(ALPHA),
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
      }),
      /missing parent/,
    );
    expectError(
      await createUsecase(db, {
        ...usecaseWrite(GAMMA),
        projekttyp: { id: GAMMA, name: "Alpha" },
      }),
      /duplicate projekttyp name/,
    );
    expectError(
      await updateUsecase(db, ALPHA, {
        ...usecaseWrite(ALPHA, "Alpha"),
        updatedAt: created.updatedAt,
        beschluss: {
          nodes: [
            {
              id: nodeId(ALPHA),
              parent_vae_node_id: nodeId(ALPHA, 2n),
              title: "Root",
              text: "",
              topic: null,
              order: 0,
              is_hidden: false,
              can_add_child: false,
            },
            {
              id: nodeId(ALPHA, 2n),
              parent_vae_node_id: nodeId(ALPHA),
              title: "Child",
              text: "",
              topic: null,
              order: 1,
              is_hidden: false,
              can_add_child: false,
            },
          ],
        },
      }),
      /cycle/,
    );
    expectError(
      await createUsecase(db, {
        ...usecaseWrite(GAMMA),
        dokumente: {
          categories: [
            { id: nodeId(GAMMA, 10n), category: "Plans", document_types: [] },
            { id: nodeId(GAMMA, 11n), category: "Plans", document_types: [] },
          ],
        },
      }),
      /duplicate document category/,
    );
    expectError(
      await createUsecase(db, {
        ...usecaseWrite(GAMMA),
        dokumente: {
          categories: [
            {
              id: nodeId(GAMMA, 10n),
              category: "Plans",
              document_types: [
                { id: nodeId(GAMMA, 11n), name: "Map", description: "", expected_count: null },
                { id: nodeId(GAMMA, 12n), name: "Map", description: "", expected_count: 1 },
              ],
            },
          ],
        },
      }),
      /duplicate document type/,
    );
  });
});

describe("seedUsecaseCatalog", () => {
  test("loads the shipped catalog when the table is empty and leaves editor writes in place", async () => {
    const empty = memoryCatalog();
    const seeded = (await seedUsecaseCatalog(empty)).unwrap();
    expect(seeded.usecases.some((usecase) => usecase.projekttyp.name === "Fernstraße")).toBe(true);

    const edited = memoryCatalog();
    (await createUsecase(edited, usecaseWrite(EDITOR))).unwrap();
    const kept = (await seedUsecaseCatalog(edited)).unwrap();
    expect(kept.usecases.map((usecase) => usecase.projekttyp.id)).toEqual([EDITOR]);
  });
});
