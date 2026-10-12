import { expect, test } from "bun:test";
import { reconstructProcessedFiles } from "../src/temporal/reverse-extraction.ts";
import { nodeFixture } from "./support/node-fixtures.ts";

test("reconstructs the canonical nested metadata dictionaries consumed by Qdrant", () => {
  const output = reconstructProcessedFiles(
    [
      nodeFixture("dokument", {
        id: "document",
        markdownTextId: "document-text",
        dmsFileId: "source-file",
      }),
      nodeFixture("markdownText", { id: "document-text", text: "report" }),
      nodeFixture("chunk", {
        id: "parent",
        dokumentId: "document",
        pageNumbers: [2],
        tocPath: ["Birds"],
        allSubchapters: ["Habitats"],
        hypotheticalQuestions: ["Which birds?"],
      }),
      nodeFixture("subChunk", {
        id: "section",
        chunkId: "parent",
        markdownTextId: "section-text",
        chunkType: "text",
        pageNumbers: [2],
        focusTopic: "Nature",
        hypotheticalQuestions: ["Which habitat?"],
        wildlifeSpecies: ["owl"],
        plantSpecies: ["oak"],
        wildlifeMentioned: true,
        plantSpeciesMentioned: true,
        header1: "Birds",
        mapScale: "1:200",
      }),
      nodeFixture("markdownText", { id: "section-text", text: "Owls nest in oak trees." }),
      nodeFixture("subChunkRelation", {
        id: "relation",
        fromSubChunkId: "section",
        toSubChunkId: "image",
        relationType: "image",
      }),
      nodeFixture("subChunkRelation", {
        id: "relation-text",
        fromSubChunkId: "section",
        toSubChunkId: "other",
        relationType: "text",
      }),
    ],
    "project",
  );
  const serialized = JSON.parse(JSON.stringify(output)) as typeof output;
  expect(serialized[0]?.processedDocument?.chunks?.[0]?.metadata).toEqual({
    page_numbers: [2],
    toc_path: ["Birds"],
    all_subchapters: ["Habitats"],
    hypothetical_questions: ["Which birds?"],
  });
  expect(serialized[0]?.processedDocument?.chunks?.[0]?.subChunks?.[0]?.metadata).toMatchObject({
    chunk_type: "text",
    page_numbers: [2],
    focus_topic: "Nature",
    hypothetical_questions: ["Which habitat?"],
    wildlife_species: ["owl"],
    plant_species: ["oak"],
    wildlife_mentioned: true,
    plant_species_mentioned: true,
    "Header 1": "Birds",
    map_scale: "1:200",
    related_assets: [{ chunk_id: "image", type: "image" }],
    related_text: [{ chunk_id: "other", type: "text" }],
  });
});
