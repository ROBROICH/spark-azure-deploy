import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "bun:test";
import { EvlogError } from "evlog";

import {
  defaultUsecaseDirectory,
  findUsecaseByProjectTypeName,
  loadUsecases,
  resolveUsecaseDirectory,
  topicsForUsecase,
  toUsecaseDocumentRows,
} from "../src/index.ts";

const shipped = defaultUsecaseDirectory();
const temps: string[] = [];

afterEach(async () => {
  await Promise.all(temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

const scratch = async () => {
  const dir = await mkdtemp(join(tmpdir(), "core-usecases-"));
  temps.push(dir);
  return dir;
};

const copyShipped = async (root: string, slug = "fernstrasse") => {
  const dest = join(root, slug);
  await mkdir(dest, { recursive: true });
  await cp(join(shipped, "fernstrasse"), dest, { recursive: true });
  return dest;
};

const expectCatalogError = async (directory: string, pattern: RegExp) => {
  const result = await loadUsecases({ directory });
  expect(result.status).toBe("error");
  if (result.status === "error") {
    expect(EvlogError.isEvlogError(result.error)).toBe(true);
    expect(result.error.message).toMatch(pattern);
  }
};

describe("loadUsecases", () => {
  test("accepts the shipped Fernstraße authority and maps it to usecase_document rows", async () => {
    const catalog = (await loadUsecases({ directory: shipped })).unwrap();
    const fern = findUsecaseByProjectTypeName(catalog.usecases, "Fernstraße");
    expect(fern).toBeDefined();
    expect(fern!.projekttyp.id).toBe("00000000-0000-0000-0000-000000000000");
    expect(fern!.gesetzesgrundlage.topics.some((topic) => topic.name === "Waldschutz")).toBe(true);
    expect(fern!.dokumente.categories.length).toBeGreaterThan(0);
    expect(fern!.beschluss.nodes.length).toBeGreaterThan(0);

    const bayern = topicsForUsecase(fern!, "BY");
    expect(bayern.some((topic) => topic.name === "Gegenstand des Vorhabens")).toBe(true);
    expect(
      bayern
        .find((topic) => topic.name === "Waldschutz")
        ?.norms.some(
          (norm) => norm.jurabk === "BayWaldG" && norm.paragraphNr === "1" && norm.type === "PRUEFUNG",
        ),
    ).toBe(true);
    expect(findUsecaseByProjectTypeName(catalog.usecases, "Unconfigured")).toBeUndefined();

    const rows = toUsecaseDocumentRows(catalog);
    expect(new Set(rows.map((row) => row.type))).toEqual(
      new Set(["projekttyp", "gesetzesgrundlage", "dokumente", "beschluss"]),
    );
    expect(rows.every((row) => row.authorityId === fern!.projekttyp.id)).toBe(true);
  });

  test("loads GG article 28 paragraph 2 for Kommunale Belange and maps it to project topics", async () => {
    const catalog = (await loadUsecases({ directory: shipped })).unwrap();
    const fern = findUsecaseByProjectTypeName(catalog.usecases, "Fernstraße");
    expect(fern).toBeDefined();

    const topic = fern!.gesetzesgrundlage.topics.find((topic) => topic.name === "Kommunale Belange");
    const norm = { jurabk: "GG", paragraphNr: "28", absatz: "2", satz: null, nummer: null };
    expect(topic?.pruefungsNorms).toEqual([norm]);

    const projectTopic = topicsForUsecase(fern!, "BY").find(
      (topic) => topic.name === "Kommunale Belange",
    );
    expect(projectTopic?.norms).toEqual([{ ...norm, type: "PRUEFUNG" }]);
  });

  test("still loads Fernstraße after an operator comment is added", async () => {
    const root = await scratch();
    const dest = await copyShipped(root);
    const path = join(dest, "dokumente.yaml");
    await writeFile(path, `# operator note\n\n${await Bun.file(path).text()}`);
    const catalog = (await loadUsecases({ directory: root })).unwrap();
    expect(catalog.usecases.some((usecase) => usecase.projekttyp.name === "Fernstraße")).toBe(true);
  });

  test("fails a present mount that has YAML files but no authority folders", async () => {
    const mount = await scratch();
    await writeFile(
      join(mount, "projekttyp.yaml"),
      "id: 00000000-0000-0000-0000-000000000000\nname: X\n",
    );
    const result = await resolveUsecaseDirectory(mount);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(EvlogError.isEvlogError(result.error)).toBe(true);
      expect(result.error.message).toMatch(/expected/);
    }
  });

  test("uses the shipped tree when the mount path is absent", async () => {
    const missing = join(await scratch(), "not-there");
    expect((await resolveUsecaseDirectory(missing)).unwrap()).toBe(defaultUsecaseDirectory());
  });

  test("rejects a missing required file", async () => {
    const root = await scratch();
    await rm(join(await copyShipped(root), "dokumente.yaml"));
    await expectCatalogError(root, /dokumente.yaml/);
  });

  test("rejects a non-UUID projekttyp id", async () => {
    const root = await scratch();
    await writeFile(
      join(await copyShipped(root), "projekttyp.yaml"),
      "id: fernstrasse\nname: Fernstraße\n",
    );
    const result = await loadUsecases({ directory: root });
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(EvlogError.isEvlogError(result.error)).toBe(true);
      expect(result.error.status).toBe(422);
    }
  });

  test("rejects a duplicate declared id", async () => {
    const root = await scratch();
    const dest = await copyShipped(root);
    const parsed = Bun.YAML.parse(await Bun.file(join(dest, "beschluss.yaml")).text()) as {
      nodes: Array<{ id: string }>;
    };
    parsed.nodes[1]!.id = parsed.nodes[0]!.id;
    await writeFile(join(dest, "beschluss.yaml"), Bun.YAML.stringify(parsed));
    await expectCatalogError(root, /duplicate/);
  });

  test("rejects a missing parent and an unknown topic", async () => {
    const root = await scratch();
    const dest = await copyShipped(root);
    await writeFile(
      join(dest, "beschluss.yaml"),
      [
        "nodes:",
        "  - id: 00000000-0000-4000-8000-000000000001",
        "    parent_vae_node_id: 00000000-0000-4000-8000-000000000099",
        "    title: Root",
        "    text: ''",
        "    topic: null",
        "    order: 0",
        "    is_hidden: false",
        "    can_add_child: false",
        "",
      ].join("\n"),
    );
    await expectCatalogError(root, /missing parent/);

    await writeFile(
      join(dest, "beschluss.yaml"),
      [
        "nodes:",
        "  - id: 00000000-0000-4000-8000-000000000001",
        "    parent_vae_node_id: null",
        "    title: Root",
        "    text: ''",
        "    topic: Not A Real Topic",
        "    order: 0",
        "    is_hidden: false",
        "    can_add_child: false",
        "",
      ].join("\n"),
    );
    await expectCatalogError(root, /unknown topic/);
  });
});
