import type { NodeRow } from "@spark-workflow/node-crud";
import type { examinationNodeTables } from "../../../examination_service/src/db/schema.ts";
import type { afdSchema } from "../../../administrative_file_draft/src/db/schema.ts";
import type { projectLogicNodeTables } from "../../../../../packages/core/projects/src/db/schema.ts";

type ExaminationTables = typeof examinationNodeTables;
type ProjectTables = typeof projectLogicNodeTables;
type AfdTables = Pick<typeof afdSchema, "risks" | "vaeNodes">;
type FixtureTables = Pick<
  ExaminationTables,
  | "gesetz"
  | "norm"
  | "absatz"
  | "satz"
  | "dokument"
  | "fundstelle"
  | "chunk"
  | "subChunk"
  | "markdownText"
  | "subChunkText"
  | "subChunkTable"
  | "subChunkImage"
  | "subChunkRelation"
  | "atomaresTbm"
  | "bewertung"
  | "bewertungKapitel"
  | "bewertungQuelle"
> &
  Pick<ProjectTables, "topics" | "subtopics" | "topicNorms"> &
  Pick<AfdTables, "vaeNodes">;

const nodeFields = {
  id: "fixture-node",
  projectId: "fixture-project",
  projectVersion: 1,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  isDeleted: false,
  isOutdated: false,
  frontendParentIds: [],
  updateType: null,
  sysPeriod: "[2026-01-01,)",
};

type FixtureRows = { [Key in keyof FixtureTables]: NodeRow<FixtureTables[Key]> };

const defaults: FixtureRows = {
  gesetz: {
    ...nodeFields,
    nodeType: "gesetz",
    name: "",
    jurabk: "",
  },
  norm: {
    ...nodeFields,
    nodeType: "norm",
    gesetzId: "",
    paragraphNr: "",
    paragraphTitel: null,
    text: "",
    regelungsgegenstand: null,
  },
  absatz: {
    ...nodeFields,
    nodeType: "absatz",
    normId: "",
    absatzNr: "",
    text: "",
  },
  satz: {
    ...nodeFields,
    nodeType: "satz",
    lastSuzResultId: null,
    absatzId: "",
    satzNr: "",
    text: "",
    normTypLvl1: null,
    normTypLvl2: null,
    tatbestandsmerkmale: [],
    formel: null,
    wennDann: null,
    markers: [],
    position: null,
  },
  dokument: {
    ...nodeFields,
    nodeType: "dokument",
    filename: "",
    mimeType: "",
    pageCount: 0,
    dmsFileId: "",
    documentType: null,
    summary: "",
    markdownTextId: "",
    documentId: null,
    isTocDocument: false,
  },
  fundstelle: {
    ...nodeFields,
    nodeType: "fundstelle",
    sourceNodeId: null,
    dokumentId: "",
    satzId: "",
    gesetzId: "",
    normId: "",
    title: "",
    text: "",
    pageNumbers: [],
    chunkIds: [],
    confidence: null,
    consensusRatio: null,
    relevance: null,
  },
  chunk: {
    ...nodeFields,
    nodeType: "chunk",
    dokumentId: "",
    header: "",
    pageNumbers: [],
    tocPath: [],
    allSubchapters: [],
    order: 0,
    nextChunkId: null,
    previousChunkId: null,
    pageIndexNodeId: null,
    pageIndexPosition: null,
    pageIndexSummary: null,
    pageContent: "",
    hypotheticalQuestions: [],
  },
  subChunk: {
    ...nodeFields,
    nodeType: "sub_chunk",
    chunkId: "",
    header: "",
    chunkType: "",
    focusTopic: "",
    hypotheticalQuestions: [],
    order: 0,
    nextSubChunkId: null,
    previousSubChunkId: null,
    markdownTextId: "",
    pageNumbers: [],
    header1: null,
    header2: null,
    header3: null,
    wildlifeMentioned: null,
    plantSpeciesMentioned: null,
    wildlifeSpecies: [],
    plantSpecies: [],
    mapScale: null,
  },
  markdownText: {
    ...nodeFields,
    nodeType: "markdown_text",
    text: "",
  },
  subChunkText: {
    ...nodeFields,
    nodeType: "sub_chunk_text",
    subChunkId: "",
  },
  subChunkTable: {
    ...nodeFields,
    nodeType: "sub_chunk_table",
    subChunkId: "",
    assetPath: "",
    caption: "",
    summary: "",
    description: "",
    content: "",
    footnote: "",
  },
  subChunkImage: {
    ...nodeFields,
    nodeType: "sub_chunk_image",
    subChunkId: "",
    assetPath: "",
    caption: "",
    summary: "",
    description: "",
    content: "",
    footnote: "",
  },
  subChunkRelation: {
    ...nodeFields,
    nodeType: "sub_chunk_relation",
    fromSubChunkId: "",
    toSubChunkId: "",
    relationType: "",
  },
  atomaresTbm: {
    ...nodeFields,
    nodeType: "atomares_tbm",
    satzId: "",
    text: "",
    prueffrage: null,
    pruefgegenstand: null,
  },
  bewertung: {
    ...nodeFields,
    nodeType: "bewertung",
    satzId: "",
    result: "",
    kurzform: null,
    norm: "",
    markdownTextId: "",
  },
  bewertungKapitel: {
    ...nodeFields,
    nodeType: "bewertung_kapitel",
    bewertungId: "",
    titel: "",
    markdown: "",
    kurzform: null,
    order: 0,
  },
  bewertungQuelle: {
    ...nodeFields,
    nodeType: "bewertung_quelle",
    bewertungId: "",
    dokumentId: "",
    fundstelleId: null,
    title: "",
    chunkIds: [],
    pageNumbers: [],
    citedSvmId: null,
  },
  topics: {
    ...nodeFields,
    nodeType: "topic",
    name: "",
    description: null,
    parentTopicId: null,
    mvpAssignee: null,
    rpbAssignee: null,
    showInMvp: false,
    showInEwm: false,
    showInBeschluss: false,
    mvpAssignees: [],
    rpbAssignees: [],
  },
  subtopics: {
    ...nodeFields,
    nodeType: "subtopic",
    topicId: "",
    name: "",
    showInMvp: false,
    showInEwm: false,
    showInBeschluss: false,
    description: null,
  },
  topicNorms: {
    ...nodeFields,
    nodeType: "topic_norm",
    topicId: "",
    jurabk: "",
    paragraphNr: null,
    satz: null,
    absatz: null,
    nummer: null,
    type: "",
    mvpStatus: "unchecked",
    satzStatuses: {},
  },
  vaeNodes: {
    ...nodeFields,
    nodeType: "vae_node",
    title: "",
    text: "",
    checkedByAssignee: false,
    checkedByLeader: false,
    checkedAtAssignee: null,
    checkedAtLeader: null,
    parentVaeNodeId: null,
    order: 0,
    isHidden: false,
    canAddChild: false,
    assignee: null,
    topicId: null,
    templateId: null,
    subtopicId: null,
  },
};

export function nodeFixture<Key extends keyof FixtureTables>(
  table: Key,
  values: Partial<NodeRow<FixtureTables[Key]>>,
): NodeRow<FixtureTables[Key]> {
  return { ...defaults[table], ...values };
}

export function examinationReader(
  rows: Partial<{ [Key in keyof ExaminationTables]: NodeRow<ExaminationTables[Key]>[] }>,
) {
  return async <Key extends keyof ExaminationTables>(
    _projectId: string,
    refs: readonly { id: string }[],
    table: Key,
  ): Promise<{ results: NodeRow<ExaminationTables[Key]>[] }> => ({
    results: (rows[table] ?? []).filter((row) => refs.some((ref) => ref.id === row.id)),
  });
}

export function projectReader(
  rows: Partial<{ [Key in keyof ProjectTables]: NodeRow<ProjectTables[Key]>[] }>,
) {
  return async <Key extends keyof ProjectTables>(
    _projectId: string,
    refs: readonly { id: string }[],
    table: Key,
  ): Promise<{ results: NodeRow<ProjectTables[Key]>[] }> => ({
    results: (rows[table] ?? []).filter((row) => refs.some((ref) => ref.id === row.id)),
  });
}

export function afdReader(rows: Partial<{ [Key in keyof AfdTables]: NodeRow<AfdTables[Key]>[] }>) {
  return async <Key extends keyof AfdTables>(
    _projectId: string,
    refs: readonly { id: string }[],
    table: Key,
  ): Promise<{ results: NodeRow<AfdTables[Key]>[] }> => ({
    results: (rows[table] ?? []).filter((row) => refs.some((ref) => ref.id === row.id)),
  });
}
