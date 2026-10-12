import { describe, expect, test } from "bun:test";

import {
  findUsecaseByProjectTypeName,
  loadUsecases,
  resolveUsecaseDirectory,
  topicsForUsecase,
  type Usecase,
} from "../../usecases/src/index.ts";

describe("Project Logic default topic catalogue", () => {
  test("preserves the complete Fernstrasse catalogue and Bayern law overlay", async () => {
    const catalog = (
      await loadUsecases({ directory: (await resolveUsecaseDirectory()).unwrap() })
    ).unwrap();
    const usecase = findUsecaseByProjectTypeName(catalog.usecases, "Fernstraße");
    expect(usecase).toBeDefined();
    const topics = topicsForUsecase(usecase!, "BY");
    const forest = topics.find(({ name }) => name === "Waldschutz");

    expect(topics.length).toBeGreaterThan(20);
    expect(topics.some(({ name }) => name === "Gegenstand des Vorhabens")).toBe(true);
    expect(topics.some(({ description }) => description.length > 100)).toBe(true);
    expect(topics.some(({ subtopics }) => subtopics.length > 0)).toBe(true);
    expect(
      forest?.norms.some(
        ({ jurabk, paragraphNr, type }) =>
          jurabk === "BayWaldG" && paragraphNr === "1" && type === "PRUEFUNG",
      ),
    ).toBe(true);
  });

  test("does not invent defaults for an unconfigured project type", async () => {
    const catalog = (
      await loadUsecases({ directory: (await resolveUsecaseDirectory()).unwrap() })
    ).unwrap();
    expect(findUsecaseByProjectTypeName(catalog.usecases, "Unconfigured")).toBeUndefined();
  });
});

const norm = { jurabk: "Law", paragraphNr: "2", absatz: null, satz: null, nummer: null };

for (const qualifier of ["absatz", "satz", "nummer"] as const) {
  test(`topic defaults keep distinct ${qualifier} values and merge exact state repeats`, () => {
    const references = [null, "", " ", "null", "1", "2"].map((value) => ({
      ...norm,
      [qualifier]: value,
    }));
    const usecase: Usecase = {
      slug: "qualifiers",
      projekttyp: { id: crypto.randomUUID(), name: "Qualifiers" },
      gesetzesgrundlage: {
        topics: [
          {
            name: "Topic",
            description: "",
            showInMvp: true,
            showInEwm: true,
            showInBeschluss: true,
            pruefungsNorms: references,
            verfahrensNorms: [norm],
            subtopics: [],
          },
        ],
        stateNormGroups: { "state|BY": references },
        topicStateGroups: { Topic: ["state"] },
      },
      dokumente: { categories: [] },
      beschluss: { nodes: [] },
    };
    expect(topicsForUsecase(usecase, "BY")[0]!.norms).toEqual([
      ...references.map((reference) => ({ ...reference, type: "PRUEFUNG" as const })),
      { ...norm, type: "VERFAHREN" as const },
    ]);
  });
}

test("topic keys preserve paragraph equivalence without delimiter collisions", () => {
  const references = [
    { ...norm, paragraphNr: null },
    { ...norm, paragraphNr: "" },
    { ...norm, jurabk: "A", paragraphNr: "B\u0000C" },
    { ...norm, jurabk: "A\u0000B", paragraphNr: "C" },
  ];
  const usecase: Usecase = {
    slug: "keys",
    projekttyp: { id: crypto.randomUUID(), name: "Keys" },
    gesetzesgrundlage: {
      topics: [
        {
          name: "Topic",
          description: "",
          showInMvp: true,
          showInEwm: true,
          showInBeschluss: true,
          pruefungsNorms: references,
          verfahrensNorms: [],
          subtopics: [],
        },
      ],
      stateNormGroups: {},
      topicStateGroups: {},
    },
    dokumente: { categories: [] },
    beschluss: { nodes: [] },
  };
  expect(topicsForUsecase(usecase, null)[0]!.norms).toEqual(
    [references[0]!, references[2]!, references[3]!].map((reference) => ({
      ...reference,
      type: "PRUEFUNG" as const,
    })),
  );
});

test("all shipped FStrBAG section 2 provisions survive topic resolution", async () => {
  const catalog = (
    await loadUsecases({ directory: (await resolveUsecaseDirectory()).unwrap() })
  ).unwrap();
  const usecase = findUsecaseByProjectTypeName(catalog.usecases, "Fernstraße")!;
  const topic = topicsForUsecase(usecase, null).find(({ name }) => name === "Zuständigkeit")!;
  expect(
    topic.norms.filter(({ jurabk, paragraphNr }) => jurabk === "FStrBAG" && paragraphNr === "2"),
  ).toEqual([
    { jurabk: "FStrBAG", paragraphNr: "2", absatz: "1", satz: "1", nummer: "4", type: "VERFAHREN" },
    {
      jurabk: "FStrBAG",
      paragraphNr: "2",
      absatz: "2",
      satz: null,
      nummer: null,
      type: "VERFAHREN",
    },
    {
      jurabk: "FStrBAG",
      paragraphNr: "2",
      absatz: "3",
      satz: null,
      nummer: null,
      type: "VERFAHREN",
    },
  ]);
});
