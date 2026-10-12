import { processingSourceDigest } from "@spark-workflow/examination-service/resource";
import { ApplicationFailure } from "@temporalio/common";
import type { ExaminationNode } from "@spark-workflow/examination-service";
import { agentOrchestrationErrors } from "../errors.ts";
import type { NodeMutationInput } from "@spark-workflow/node-crud";
import { heartbeat as temporalHeartbeat } from "@temporalio/activity";
import { Result } from "better-result";
import type { EvlogError } from "evlog";
import {
  buildRechtsmethodikWritePlan,
  normalizeNormValue,
  normalizeParagraph,
  type ExaminationTopicNorm,
  type RechtsmethodikWriteInput,
  type RechtsmethodikWorkflowOutput as RechtsmethodikResult,
  type SucheZuordnungDocument as SuzDocument,
  type SucheZuordnungNormData as NormData,
  type WorkflowFailureCode,
} from "@spark-temporal/contracts";

import {
  type BatchInsertExtractionInput,
  type BatchInsertExtractionOutput,
  type DocumentExtractionEntry,
  type FileObject,
  type GraphReference,
  type NodeMutation,
  type ProcessedFileInfo,
  type TemplateDocumentType,
} from "../schemas.ts";
import {
  type CachedNormBatchInput,
  type CachedNormBatchOutput,
  type ExaminationRechtsmethodikContext,
  type NormExaminationIds,
  type NormRef,
  type SuzDocuments,
} from "./norm-contracts.ts";
import type { CoreAosActivities } from "./registrations.ts";
import { reconstructProcessedFiles } from "./reverse-extraction.ts";
import type { FvpActivityResult } from "./workflow-contracts.ts";
import type { createAosInternalActivityDependencies } from "../internal-services.ts";

type NodeReference = { nodeType: string; id: string };

interface DmsBoundary {
  getZipFile: InternalDependencies["dms"]["getZipFile"];
  listFiles(projectId: string, fileType?: string): Promise<FileObject[]>;
  updateFileTopics(fileId: string, topics: readonly string[]): Promise<FileObject>;
  uploadFile(input: {
    projectId: string;
    filename: string;
    type: "document" | "zip";
    bytes: Uint8Array;
  }): Promise<FileObject | null>;
}

interface FormalBoundary {
  sendResults(projectId: string, fileId: string): Promise<unknown>;
  getResults(projectId: string): Promise<unknown>;
  getTemplateDocumentTypes(projectId: string): Promise<TemplateDocumentType[]>;
  sendTocResults(projectId: string, fileId: string): Promise<unknown>;
}

type InternalDependencies = ReturnType<typeof createAosInternalActivityDependencies>;
type ExaminationBoundary = Omit<
  InternalDependencies["examination"],
  "listNodes" | "updateNodes"
> & {
  listNodes(projectId: string): Promise<{ nodes: GraphReference[] }>;
  updateNodes(
    projectId: string,
    mutation: NodeMutationInput,
  ): Promise<{
    inserted?: readonly unknown[];
    updated?: readonly unknown[];
    deleted?: readonly unknown[];
  }>;
};

export interface AosActivityDependencies {
  dms: DmsBoundary;
  formal: FormalBoundary;
  plausibility: {
    sendResults(projectId: string, fileId: string): Promise<unknown>;
  };
  examination: ExaminationBoundary;
  projectLogic: Omit<InternalDependencies["projectLogic"], "listNodes"> & {
    listNodes(projectId: string): Promise<{ nodes: GraphReference[] }>;
  };
  fpp: {
    downloadSource(url: string): Promise<Uint8Array>;
  };
  fppFiles: InternalDependencies["fppFiles"];
}

export interface AosActivityOptions {
  heartbeat?: (detail: string) => void;
}

const DEPENDENT_NODE_TYPES = new Set([
  "chunk",
  "sub_chunk",
  "sub_chunk_text",
  "sub_chunk_table",
  "sub_chunk_image",
  "sub_chunk_relation",
]);
const FETCH_NODE_TYPES = new Set([
  "dokument",
  "chunk",
  "sub_chunk",
  "sub_chunk_text",
  "sub_chunk_table",
  "sub_chunk_image",
  "markdown_text",
  "sub_chunk_relation",
]);
const EXTRACTION_BATCH_SIZE = 50;
const CACHED_NORM_BATCH_SIZE = 10;
const NODE_FETCH_BATCH_SIZE = 100;

function collectDependentRefs(
  graphNodes: readonly GraphReference[],
  roots: readonly NodeReference[],
): NodeReference[] {
  const childrenByParent = new Map<string, GraphReference[]>();
  for (const node of graphNodes) {
    for (const parent of node.parents ?? []) {
      const key = `${parent.nodeType}:${parent.id}`;
      const children = childrenByParent.get(key) ?? [];
      children.push(node);
      childrenByParent.set(key, children);
    }
  }
  const queue = roots.flatMap((root) => childrenByParent.get(`${root.nodeType}:${root.id}`) ?? []);
  const deleted = new Map<string, NodeReference>();
  while (queue.length > 0) {
    const current = queue.pop()!;
    if (!DEPENDENT_NODE_TYPES.has(current.nodeType)) continue;
    const key = `${current.nodeType}:${current.id}`;
    if (deleted.has(key)) continue;
    deleted.set(key, { nodeType: current.nodeType, id: current.id });
    if (current.nodeType === "sub_chunk") {
      for (const parent of current.parents ?? []) {
        if (parent.nodeType === "markdown_text") {
          deleted.set(`${parent.nodeType}:${parent.id}`, parent);
        }
      }
    }
    queue.push(...(childrenByParent.get(key) ?? []));
  }
  return [...deleted.values()];
}

interface GraphState {
  graphNodes: GraphReference[];
  allExistingIds: Set<string>;
  documentsById: Map<string, ExaminationNode<"dokument">>;
  freshFileIds: Set<string>;
  staleDocumentIdsByFile: Map<string, string[]>;
  deletedKeys: Set<string>;
}

async function loadGraphState(
  examination: ExaminationBoundary,
  projectId: string,
): Promise<GraphState> {
  const { nodes } = await examination.listNodes(projectId);
  const documentRefs = nodes
    .filter(({ nodeType }) => nodeType === "dokument")
    .map(({ nodeType, id }) => ({ nodeType, id }));
  const documents =
    documentRefs.length === 0
      ? []
      : (await examination.batchGetNodes(projectId, documentRefs, "dokument")).results;
  const state: GraphState = {
    graphNodes: nodes,
    allExistingIds: new Set(nodes.map(({ id }) => id)),
    documentsById: new Map(documents.map((document) => [document.id, document])),
    freshFileIds: new Set(
      documents.flatMap((document) => {
        const fileId = document.dmsFileId;
        return fileId !== undefined && fileId !== null && document.isOutdated !== true
          ? [fileId]
          : [];
      }),
    ),
    staleDocumentIdsByFile: new Map(),
    deletedKeys: new Set(),
  };
  for (const document of documents) {
    if (document.isOutdated !== true) continue;
    const fileId = document.dmsFileId;
    if (fileId === undefined || fileId === null) continue;
    const values = state.staleDocumentIdsByFile.get(fileId) ?? [];
    values.push(document.id);
    state.staleDocumentIdsByFile.set(fileId, values);
  }
  return state;
}

function undeleted(refs: readonly NodeReference[], state: GraphState): NodeReference[] {
  return refs.filter(({ nodeType, id }) => !state.deletedKeys.has(`${nodeType}:${id}`));
}

async function processExtractionBatch(
  examination: ExaminationBoundary,
  projectId: string,
  entries: readonly DocumentExtractionEntry[],
  state: GraphState,
): Promise<BatchInsertExtractionOutput["results"]> {
  const inserts: NodeMutation[] = [];
  const updates: NodeMutation[] = [];
  const deletes: NodeReference[] = [];
  const results: BatchInsertExtractionOutput["results"] = [];
  const writtenFileIds = new Set<string>();

  for (const entry of entries) {
    const sourceFileId = entry.sourceFileId ?? undefined;
    if (sourceFileId !== undefined && state.freshFileIds.has(sourceFileId)) {
      results.push({
        dokumentId: entry.dokumentId,
        skipped: true,
        nodesInserted: 0,
      });
      continue;
    }
    const replaceExisting =
      entry.hasDokumentIdOverride &&
      sourceFileId !== undefined &&
      state.staleDocumentIdsByFile.has(sourceFileId);
    if (replaceExisting) {
      deletes.push(
        ...undeleted(
          collectDependentRefs(state.graphNodes, [{ nodeType: "dokument", id: entry.dokumentId }]),
          state,
        ),
      );
      const existing = state.documentsById.get(entry.dokumentId);
      const markdownId = existing?.markdownTextId;
      if (markdownId !== undefined) {
        deletes.push(...undeleted([{ nodeType: "markdown_text", id: markdownId }], state));
      }
      const documentInsert = entry.inserts.find(({ nodeType }) => nodeType === "dokument");
      if (documentInsert === undefined) {
        throw new Error("Replacement inserts missing 'dokument' node");
      }
      updates.push({
        nodeType: "dokument",
        id: entry.dokumentId,
        payload: { ...documentInsert.payload, isOutdated: false, isTocDocument: false },
      });
      const childInserts = entry.inserts.filter(
        ({ nodeType, id }) => nodeType !== "dokument" && !state.allExistingIds.has(id),
      );
      inserts.push(...childInserts);
      if (sourceFileId !== undefined) writtenFileIds.add(sourceFileId);
      results.push({
        dokumentId: entry.dokumentId,
        skipped: false,
        nodesInserted: childInserts.length + 1,
      });
      continue;
    }

    if (sourceFileId !== undefined) {
      const staleIds = state.staleDocumentIdsByFile.get(sourceFileId) ?? [];
      deletes.push(
        ...undeleted(
          collectDependentRefs(
            state.graphNodes,
            staleIds.map((id) => ({ nodeType: "dokument", id })),
          ),
          state,
        ),
      );
    }
    const newInserts = entry.inserts.filter(({ id }) => !state.allExistingIds.has(id));
    if (newInserts.length === 0) {
      results.push({
        dokumentId: entry.dokumentId,
        skipped: true,
        nodesInserted: 0,
      });
      continue;
    }
    inserts.push(...newInserts);
    if (sourceFileId !== undefined) writtenFileIds.add(sourceFileId);
    results.push({
      dokumentId: entry.dokumentId,
      skipped: false,
      nodesInserted: newInserts.length,
    });
  }

  const uniqueDeletes = [
    ...new Map(deletes.map((item) => [`${item.nodeType}:${item.id}`, item])).values(),
  ];
  if (inserts.length > 0 || updates.length > 0 || uniqueDeletes.length > 0) {
    await examination.updateNodes(projectId, {
      inserts,
      updates,
      deletes: uniqueDeletes,
    });
    for (const insert of inserts) state.allExistingIds.add(insert.id);
    for (const item of uniqueDeletes) state.deletedKeys.add(`${item.nodeType}:${item.id}`);
    for (const id of writtenFileIds) state.freshFileIds.add(id);
  }
  return results;
}

async function existingDocuments(
  examination: ExaminationBoundary,
  projectId: string,
): Promise<ExaminationNode<"dokument">[]> {
  const graph = await examination.listNodes(projectId);
  const refs = graph.nodes
    .filter(({ nodeType }) => nodeType === "dokument")
    .map(({ nodeType, id }) => ({ nodeType, id }));
  return refs.length === 0
    ? []
    : (await examination.batchGetNodes(projectId, refs, "dokument")).results;
}

function refsByType(nodes: readonly GraphReference[], nodeType: string): NodeReference[] {
  return nodes
    .filter((node) => node.nodeType === nodeType)
    .map(({ id }) => ({ nodeType: nodeType, id }));
}

async function batchResolve<Key extends Parameters<ExaminationBoundary["batchGetNodes"]>[2]>(
  peer: Pick<ExaminationBoundary, "batchGetNodes">,
  projectId: string,
  refs: readonly NodeReference[],
  table: Key,
) {
  const batches = [];
  for (let offset = 0; offset < refs.length; offset += NODE_FETCH_BATCH_SIZE) {
    batches.push(
      peer.batchGetNodes(projectId, refs.slice(offset, offset + NODE_FETCH_BATCH_SIZE), table),
    );
  }
  return (await Promise.all(batches)).flatMap(({ results }) => results);
}

function hasParent(
  node: GraphReference,
  nodeType: string,
  parentIds: ReadonlySet<string>,
): boolean {
  return (node.parents ?? []).some(
    (parent) => parent.nodeType === nodeType && parentIds.has(String(parent.id)),
  );
}

async function projectTopicNorms(
  projectLogic: AosActivityDependencies["projectLogic"],
  projectId: string,
) {
  const graph = await projectLogic.listNodes(projectId);
  const topicIds = new Set(
    graph.nodes.filter((node) => node.nodeType === "topic").map(({ id }) => id),
  );
  const refs = graph.nodes
    .filter((node) => node.nodeType === "topic_norm" && hasParent(node, "topic", topicIds))
    .map(({ id }) => ({ nodeType: "topic_norm", id }));
  const pages = [];
  for (let offset = 0; offset < refs.length; offset += NODE_FETCH_BATCH_SIZE) {
    pages.push(
      projectLogic.batchGetNodes(
        projectId,
        refs.slice(offset, offset + NODE_FETCH_BATCH_SIZE),
        "topicNorms",
      ),
    );
  }
  const values = (await Promise.all(pages)).flatMap(({ results }) =>
    results.map((row) => {
      if (row.paragraphNr === null) {
        throw agentOrchestrationErrors.MISSING_PARAGRAPH({ internal: { topicNormId: row.id } });
      }
      return { ...row, paragraphNr: row.paragraphNr };
    }),
  );
  return { topicIds, values };
}

async function fetchProjectNormRefs(
  projectLogic: AosActivityDependencies["projectLogic"],
  projectId: string,
): Promise<NormRef[]> {
  const { topicIds, values } = await projectTopicNorms(projectLogic, projectId);
  const norms = new Map<string, NormRef>();
  for (const item of values) {
    if (!topicIds.has(item.topicId)) continue;
    const key = `${normalizeNormValue(item.jurabk)}\u0000${normalizeParagraph(item.paragraphNr)}`;
    let norm = norms.get(key);
    if (norm === undefined) {
      norm = {
        jurabk: item.jurabk,
        paragraphNr: item.paragraphNr,
        topicNorms: [],
      };
      norms.set(key, norm);
    }
    norm.topicNorms.push({
      ownerNodeType: "topic",
      ownerNodeId: item.topicId,
      topicNormId: item.id,
    });
  }
  return [...norms.values()];
}

async function rechtsmethodikContext(
  examination: ExaminationBoundary,
  projectId: string,
): Promise<ExaminationRechtsmethodikContext> {
  const graph = await examination.listNodes(projectId);
  const [gesetze, norms, absaetze, saetze] = await Promise.all([
    batchResolve(examination, projectId, refsByType(graph.nodes, "gesetz"), "gesetz"),
    batchResolve(examination, projectId, refsByType(graph.nodes, "norm"), "norm"),
    batchResolve(examination, projectId, refsByType(graph.nodes, "absatz"), "absatz"),
    batchResolve(examination, projectId, refsByType(graph.nodes, "satz"), "satz"),
  ]);
  return { gesetze, norms, absaetze, saetze };
}

async function cachedNormBatch(
  dependencies: AosActivityDependencies,
  input: CachedNormBatchInput,
): Promise<CachedNormBatchOutput> {
  if (input.norms.length === 0) return { results: [], uncachedNorms: [] };
  const context = await rechtsmethodikContext(dependencies.examination, input.projectId);
  const materializations: RechtsmethodikWriteInput[] = [];
  const uncached: NormRef[] = [];
  let fallbackTopicNorms: ExaminationTopicNorm[] | undefined;
  for (const norm of input.norms) {
    const jurabk = normalizeNormValue(norm.jurabk);
    const paragraph = normalizeParagraph(norm.paragraphNr);
    const rows = await dependencies.examination.getNormDeconstructions(jurabk, paragraph);
    const row =
      rows[0] ??
      (jurabk !== norm.jurabk || paragraph !== norm.paragraphNr
        ? (await dependencies.examination.getNormDeconstructions(norm.jurabk, norm.paragraphNr))[0]
        : undefined);
    if (row === undefined) {
      uncached.push(norm);
      continue;
    }
    const deconstruction: RechtsmethodikResult = row.deconstruction;
    const topicNorms =
      norm.topicNorms.length > 0
        ? norm.topicNorms.map((item) => ({
            id: item.topicNormId,
            nodeType: "topic_norm",
            topicId: item.ownerNodeType === "topic" ? item.ownerNodeId : null,
            subtopicId: item.ownerNodeType === "subtopic" ? item.ownerNodeId : null,
            jurabk: deconstruction.jurabk,
            paragraphNr: deconstruction.paragraphNr,
          }))
        : (fallbackTopicNorms ??= (
            await projectTopicNorms(dependencies.projectLogic, input.projectId)
          ).values);
    materializations.push({ normResult: deconstruction, topicNorms });
  }
  const plan = buildRechtsmethodikWritePlan(materializations, context, () => crypto.randomUUID());
  const results = plan.results.map((materialized) => ({
    projectId: input.projectId,
    jurabk: materialized.jurabk,
    paragraphNr: materialized.paragraphNr,
    skipped: !materialized.changed,
    gesetzId: materialized.gesetzId,
    normId: materialized.normId,
  }));
  if (plan.inserts.length > 0 || plan.updates.length > 0) {
    await dependencies.examination.updateNodes(input.projectId, {
      inserts: plan.inserts,
      updates: plan.updates,
    });
  }
  return { results, uncachedNorms: uncached };
}

async function cachedNormBatches(
  dependencies: AosActivityDependencies,
  input: CachedNormBatchInput,
): Promise<CachedNormBatchOutput> {
  const results: CachedNormBatchOutput["results"] = [];
  const uncached: NormRef[] = [];
  for (let offset = 0; offset < input.norms.length; offset += CACHED_NORM_BATCH_SIZE) {
    const output = await cachedNormBatch(dependencies, {
      ...input,
      norms: input.norms.slice(offset, offset + CACHED_NORM_BATCH_SIZE),
    });
    results.push(...output.results);
    uncached.push(...output.uncachedNorms);
  }
  return { results, uncachedNorms: uncached };
}

type NumericSortKey = [number, number, string];

function numericSort(text: string): NumericSortKey {
  return /^\d+$/.test(text) ? [0, Number(text), ""] : [1, 0, text];
}

function compareNumeric(left: NumericSortKey, right: NumericSortKey): number {
  return left[0] - right[0] || left[1] - right[1] || left[2].localeCompare(right[2]);
}

type SatzSortKey = [number, number, number, number, string, string, string];

function satzSortKey(value: ExaminationNode<"satz">): SatzSortKey {
  const position = value.position ?? null;
  const numeric = numericSort(value.satzNr);
  return [
    position === null ? 1 : 0,
    position ?? 0,
    ...numeric,
    value.createdAt.toISOString(),
    value.id,
  ];
}

function compareSatz(left: SatzSortKey, right: SatzSortKey): number {
  return (
    left[0] - right[0] ||
    left[1] - right[1] ||
    left[2] - right[2] ||
    left[3] - right[3] ||
    left[4].localeCompare(right[4]) ||
    left[5].localeCompare(right[5]) ||
    left[6].localeCompare(right[6])
  );
}

async function buildSuzDocuments(
  examination: ExaminationBoundary,
  projectId: string,
  heartbeat: (detail: string) => void,
): Promise<SuzDocuments> {
  const graph = await examination.listNodes(projectId);
  const [documents, chunks, subChunks, markdown] = await Promise.all([
    batchResolve(examination, projectId, refsByType(graph.nodes, "dokument"), "dokument").then(
      (rows) => {
        heartbeat("Resolved dokument nodes");
        return rows;
      },
    ),
    batchResolve(examination, projectId, refsByType(graph.nodes, "chunk"), "chunk").then((rows) => {
      heartbeat("Resolved chunk nodes");
      return rows;
    }),
    batchResolve(examination, projectId, refsByType(graph.nodes, "sub_chunk"), "subChunk").then(
      (rows) => {
        heartbeat("Resolved sub_chunk nodes");
        return rows;
      },
    ),
    batchResolve(
      examination,
      projectId,
      refsByType(graph.nodes, "markdown_text"),
      "markdownText",
    ).then((rows) => {
      heartbeat("Resolved markdown_text nodes");
      return rows;
    }),
  ]);
  const usedMarkdown = new Set([...documents, ...subChunks].map((node) => node.markdownTextId));
  const sourceMarkdown = markdown.filter(({ id }) => usedMarkdown.has(id));
  if ([...documents, ...chunks, ...subChunks, ...sourceMarkdown].some((node) => node.isOutdated))
    throw ApplicationFailure.nonRetryable(
      "Document extraction must finish before searching for evidence",
      "OutdatedSearchSources",
    );
  documents.sort((left, right) => left.id.localeCompare(right.id));
  const subByChunk = new Map<string, ExaminationNode<"subChunk">[]>();
  for (const item of subChunks) {
    const key = item.chunkId;
    const values = subByChunk.get(key) ?? [];
    values.push(item);
    subByChunk.set(key, values);
  }
  for (const values of subByChunk.values()) {
    values.sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
  }
  const markdownById = new Map(markdown.map((item) => [item.id, item.text]));
  const output: SuzDocument[] = [];
  for (const document of documents) {
    const documentId = document.id;
    const ownChunks = chunks
      .filter((item) => item.dokumentId === documentId)
      .sort((left, right) => Number(left.order ?? 0) - Number(right.order ?? 0));
    const groups = new Map<string, ExaminationNode<"chunk">[]>();
    for (const chunk of ownChunks) {
      const key = chunk.pageIndexNodeId ?? chunk.id;
      const values = groups.get(key) ?? [];
      values.push(chunk);
      groups.set(key, values);
    }
    const nodes = [...groups.entries()].map(([nodeId, values]) => {
      values.sort(
        (left, right) => Number(left.pageIndexPosition ?? 0) - Number(right.pageIndexPosition ?? 0),
      );
      const head = values[0]!;
      const chunkIds: string[] = [];
      const pageNumbers = new Set<number>();
      const text: string[] = [];
      for (const chunk of values) {
        const chunkId = chunk.id;
        chunkIds.push(chunkId);
        for (const page of chunk.pageNumbers ?? []) pageNumbers.add(page);
        for (const sub of subByChunk.get(chunkId) ?? []) {
          chunkIds.push(sub.id);
          const value = markdownById.get(sub.markdownTextId);
          if (value !== undefined) text.push(value);
        }
      }
      return {
        nodeId: nodeId,
        title: head.header ?? "",
        text: text.join(""),
        summary: head.pageIndexSummary ?? head.header ?? "",
        chunkIds: chunkIds,
        pageNumbers: [...pageNumbers].sort((left, right) => left - right),
      };
    });
    output.push({
      fileId: document.dmsFileId ?? documentId,
      documentName: document.filename ?? "",
      nodes,
    });
  }
  return {
    documents: output,
    sources: [...documents, ...chunks, ...subChunks, ...sourceMarkdown].map((node) => ({
      nodeType: node.nodeType,
      id: node.id,
      updatedAt: node.updatedAt.toISOString(),
      digest: processingSourceDigest(node),
      isOutdated: node.isOutdated,
    })),
  };
}

async function buildNormData(
  examination: ExaminationBoundary,
  projectId: string,
  normId: string,
  heartbeat: (detail: string) => void,
): Promise<NormData> {
  const graph = await examination.listNodes(projectId);
  const normRef = graph.nodes.find(
    ({ nodeType, id }) => nodeType === "norm" && String(id) === normId,
  );
  if (normRef === undefined) {
    throw new Error(`Norm ${normId} not found in examination service for project ${projectId}`);
  }
  const lawParent = (normRef.parents ?? []).find(({ nodeType }) => nodeType === "gesetz");
  const lawRef =
    lawParent === undefined
      ? undefined
      : graph.nodes.find(({ nodeType, id }) => nodeType === "gesetz" && id === lawParent.id);
  const [norms, laws, absaetze, saetze, tbms] = await Promise.all([
    batchResolve(examination, projectId, [{ nodeType: "norm", id: normRef.id }], "norm"),
    lawRef === undefined
      ? Promise.resolve([])
      : batchResolve(examination, projectId, [{ nodeType: "gesetz", id: lawRef.id }], "gesetz"),
    batchResolve(examination, projectId, refsByType(graph.nodes, "absatz"), "absatz"),
    batchResolve(examination, projectId, refsByType(graph.nodes, "satz"), "satz"),
    batchResolve(examination, projectId, refsByType(graph.nodes, "atomares_tbm"), "atomaresTbm"),
  ]);
  heartbeat("Resolved all norm hierarchy nodes");
  const norm = norms[0];
  if (norm === undefined) throw new Error(`Norm ${normId} could not be resolved`);
  const law = laws[0];
  const ownAbsaetze = absaetze
    .filter((item) => item.normId === normId)
    .sort((left, right) => compareNumeric(numericSort(left.absatzNr), numericSort(right.absatzNr)));
  const output = {
    gesetz: law?.name ?? "",
    jurabk: law?.jurabk ?? "",
    paragraph: null,
    paragraphNr: norm.paragraphNr,
    paragraphTitel: norm.paragraphTitel ?? "",
    absaetze: ownAbsaetze.map((absatz) => {
      const absatzId = absatz.id;
      const ownSaetze = saetze
        .filter((satz) => satz.absatzId === absatzId)
        .sort((left, right) => compareSatz(satzSortKey(left), satzSortKey(right)));
      return {
        absatzNr: absatz.absatzNr,
        absatzText: absatz.text ?? "",
        saetze: ownSaetze.map((satz, fallbackPosition) => ({
          id: satz.id,
          satzNr: satz.satzNr,
          position: satz.position ?? fallbackPosition,
          satzText: satz.text ?? "",
          normTypLvl1: satz.normTypLvl1 ?? null,
          normTypLvl2: satz.normTypLvl2 ?? null,
          tatbestandsmerkmale: satz.tatbestandsmerkmale ?? [],
          atomareTatbestandsmerkmale: tbms
            .filter((tbm) => tbm.satzId === satz.id)
            .map((tbm) => ({
              id: tbm.id,
              prueffrage: tbm.prueffrage ?? null,
              rechtsbegriffe: null,
            })),
        })),
      };
    }),
  };
  return output;
}

async function normExaminationIds(
  examination: ExaminationBoundary,
  projectId: string,
  normId: string,
  heartbeat: (detail: string) => void,
): Promise<NormExaminationIds> {
  const graph = await examination.listNodes(projectId);
  const normRef = graph.nodes.find(
    ({ nodeType, id }) => nodeType === "norm" && String(id) === normId,
  );
  if (normRef === undefined) throw new Error(`Norm node ${normId} not found`);
  const law = (normRef.parents ?? []).find(({ nodeType }) => nodeType === "gesetz");
  if (law === undefined) throw new Error(`Norm node ${normId} has no gesetz parent`);
  const [absaetze, saetze, fundstellen, norms] = await Promise.all([
    batchResolve(examination, projectId, refsByType(graph.nodes, "absatz"), "absatz").then(
      (rows) => {
        heartbeat("Resolved absatz nodes");
        return rows;
      },
    ),
    batchResolve(examination, projectId, refsByType(graph.nodes, "satz"), "satz").then((rows) => {
      heartbeat("Resolved satz nodes");
      return rows;
    }),
    batchResolve(examination, projectId, refsByType(graph.nodes, "fundstelle"), "fundstelle"),
    batchResolve(examination, projectId, [{ nodeType: "norm", id: normId }], "norm"),
  ]);
  const ownAbsaetze = absaetze.filter((item) => item.normId === normId);
  const lookup: Record<string, string> = {};
  for (const absatz of ownAbsaetze) {
    const values = saetze
      .filter((satz) => satz.absatzId === absatz.id)
      .sort((left, right) => compareSatz(satzSortKey(left), satzSortKey(right)));
    values.forEach((satz, fallback) => {
      const position = satz.position ?? fallback;
      lookup[`${absatz.absatzNr}:${satz.satzNr}:${position}`] = satz.id;
    });
  }
  const ownSaetze = saetze.filter((satz) =>
    ownAbsaetze.some((absatz) => absatz.id === satz.absatzId),
  );
  const ownFundstellen = fundstellen.filter((source) =>
    ownSaetze.some((satz) => satz.id === source.satzId),
  );
  return {
    gesetzId: String(law.id),
    satzIdLookup: lookup,
    satzUpdatedAt: Object.fromEntries(
      ownSaetze.map((satz) => [satz.id, satz.updatedAt.toISOString()]),
    ),
    sources: [...norms, ...ownAbsaetze, ...ownSaetze, ...ownFundstellen].map((node) => ({
      nodeType: node.nodeType,
      id: node.id,
      updatedAt: node.updatedAt.toISOString(),
      digest: processingSourceDigest(node),
      isOutdated: node.isOutdated,
      satzId: "satzId" in node ? node.satzId : node.nodeType === "satz" ? node.id : undefined,
    })),
  };
}

async function existingSuzDocuments(
  examination: ExaminationBoundary,
  projectId: string,
): Promise<Record<string, string>> {
  const graph = await examination.listNodes(projectId);
  const documents = await batchResolve(
    examination,
    projectId,
    refsByType(graph.nodes, "dokument"),
    "dokument",
  );
  return Object.fromEntries(
    documents.flatMap((document) =>
      document.dmsFileId === undefined || document.dmsFileId === null
        ? []
        : [[document.dmsFileId, document.id]],
    ),
  );
}

/** The project's files, or `NO_DOCUMENTS` when it has none. A DMS error stays thrown. */
export async function listProjectFiles(
  dms: AosActivityDependencies["dms"],
  projectId: string,
): Promise<Result<FileObject[], EvlogError>> {
  const files = await dms.listFiles(projectId);
  return files.length === 0
    ? Result.err(
        agentOrchestrationErrors.NO_DOCUMENTS({
          message: `No documents found for project ${projectId}`,
        }),
      )
    : Result.ok(files);
}

const fvpFailureByCatalogCode = new Map<string, WorkflowFailureCode>([
  [agentOrchestrationErrors.NO_DOCUMENTS.code, "NO_DOCUMENTS"],
]);

/**
 * Converts an FVP step result into the activity payload the workflow turns into its failure type.
 * Any other error stays thrown so Temporal retries the activity.
 */
function fvpActivityResult<T>(result: Result<T, EvlogError>): FvpActivityResult<T> {
  if (result.isOk()) return { ok: true, value: result.value };
  const code = fvpFailureByCatalogCode.get(result.error.code ?? "");
  if (code === undefined) throw result.error;
  return { ok: false, failure: { code, message: result.error.message } };
}

export function createAosActivities(
  dependencies: AosActivityDependencies,
  options: AosActivityOptions = {},
): CoreAosActivities {
  const heartbeat = options.heartbeat ?? temporalHeartbeat;
  return {
    async downloadFppFile(input) {
      const source = await dependencies.fppFiles.getFile(input.projectId, input.fileId);
      let dmsFileId = source.dmsFileId;
      if (dmsFileId === null) {
        const uploaded = await dependencies.dms.uploadFile({
          projectId: input.projectId,
          filename: source.fileName ?? "planunterlagen.zip",
          type: "zip",
          bytes: await dependencies.fpp.downloadSource(source.fileUrl),
        });
        if (uploaded === null) return null;
        dmsFileId = uploaded.id;
        await dependencies.fppFiles.confirmDownload(input.projectId, source.id, dmsFileId);
      }
      const receipt = await dependencies.dms.getZipFile(dmsFileId, input.projectId);
      if (receipt.workflowStatus !== "PENDING" || receipt.approvalStatus !== null) {
        throw ApplicationFailure.nonRetryable(
          `FPP archive ${dmsFileId} is already processed; resume it through document management`,
          "FPP_ZIP_ALREADY_ADMITTED",
        );
      }
      return receipt;
    },
    sendFvpResults: ({ projectId, fileId }) => dependencies.formal.sendResults(projectId, fileId),
    sendPlausibilityResults: ({ projectId, fileId }) =>
      dependencies.plausibility.sendResults(projectId, fileId),
    fetchExistingDokumentNodes: (projectId) =>
      existingDocuments(dependencies.examination, projectId),
    getFormalCompletenessResults: (projectId) => dependencies.formal.getResults(projectId),
    getProjectFiles: (projectId) => dependencies.dms.listFiles(projectId),
    listFvpProjectFiles: async (projectId) =>
      fvpActivityResult(await listProjectFiles(dependencies.dms, projectId)),
    getTemplateDocumentTypes: (projectId) =>
      dependencies.formal.getTemplateDocumentTypes(projectId),
    sendTocMatchingResults: ({ projectId, fileId }) =>
      dependencies.formal.sendTocResults(projectId, fileId),
    async markTocDocument(projectId, dmsFileId) {
      const documents = await existingDocuments(dependencies.examination, projectId);
      const updates = documents.map((document) => ({
        nodeType: "dokument",
        id: document.id,
        payload: {
          isTocDocument: document.dmsFileId === dmsFileId,
        },
      }));
      if (updates.length === 0) return { updated: [] };
      return dependencies.examination.updateNodes(projectId, {
        inserts: [],
        updates,
      });
    },
    async batchInsertExtractionNodes(input: BatchInsertExtractionInput) {
      if (input.entries.length === 0) return { results: [] };
      const state = await loadGraphState(dependencies.examination, input.projectId);
      const results: BatchInsertExtractionOutput["results"] = [];
      for (let offset = 0; offset < input.entries.length; offset += EXTRACTION_BATCH_SIZE) {
        results.push(
          ...(await processExtractionBatch(
            dependencies.examination,
            input.projectId,
            input.entries.slice(offset, offset + EXTRACTION_BATCH_SIZE),
            state,
          )),
        );
      }
      return { results };
    },
    async getTopics(projectId) {
      return (await dependencies.projectLogic.listTopics(projectId)).filter(
        ({ parentTopicId }) => parentTopicId === null,
      );
    },
    updateFileTopics: (fileId, topicIds) => dependencies.dms.updateFileTopics(fileId, topicIds),
    async fetch_processed_documents_from_graph(projectId): Promise<ProcessedFileInfo[]> {
      const graph = await dependencies.examination.listNodes(projectId);
      const refs = graph.nodes
        .filter(({ nodeType }) => FETCH_NODE_TYPES.has(nodeType))
        .map(({ nodeType, id }) => ({ nodeType, id }));
      if (!refs.some(({ nodeType }) => nodeType === "dokument")) return [];
      const nodes = (
        await Promise.all([
          batchResolve(
            dependencies.examination,
            projectId,
            refsByType(refs, "dokument"),
            "dokument",
          ),
          batchResolve(dependencies.examination, projectId, refsByType(refs, "chunk"), "chunk"),
          batchResolve(
            dependencies.examination,
            projectId,
            refsByType(refs, "sub_chunk"),
            "subChunk",
          ),
          batchResolve(
            dependencies.examination,
            projectId,
            refsByType(refs, "sub_chunk_text"),
            "subChunkText",
          ),
          batchResolve(
            dependencies.examination,
            projectId,
            refsByType(refs, "sub_chunk_table"),
            "subChunkTable",
          ),
          batchResolve(
            dependencies.examination,
            projectId,
            refsByType(refs, "sub_chunk_image"),
            "subChunkImage",
          ),
          batchResolve(
            dependencies.examination,
            projectId,
            refsByType(refs, "sub_chunk_relation"),
            "subChunkRelation",
          ),
          batchResolve(
            dependencies.examination,
            projectId,
            refsByType(refs, "markdown_text"),
            "markdownText",
          ),
        ])
      ).flat();
      return reconstructProcessedFiles(nodes, projectId);
    },
    fetchExaminationRechtsmethodikContext: (projectId) =>
      rechtsmethodikContext(dependencies.examination, projectId),
    async fetchPlsTopicNorms(projectId) {
      return (await projectTopicNorms(dependencies.projectLogic, projectId)).values;
    },
    async insertRechtsmethodikResult(input) {
      if (input.inserts.length === 0 && input.updates.length === 0) {
        return {
          gesetzId: input.gesetzId,
          normId: input.normId,
          skipped: true,
          nodesInserted: 0,
        };
      }
      const result = await dependencies.examination.updateNodes(input.projectId, {
        inserts: input.inserts,
        updates: input.updates,
      });
      return {
        gesetzId: input.gesetzId,
        normId: input.normId,
        skipped: false,
        nodesInserted: Array.isArray(result.inserted)
          ? result.inserted.length
          : input.inserts.length,
      };
    },
    async getNormDeconstruction(input) {
      const rows = await dependencies.examination.getNormDeconstructions(
        input.jurabk,
        input.paragraphNr,
      );
      if (rows[0] === undefined) return null;
      return rows[0].deconstruction;
    },
    saveNormDeconstruction: (input) =>
      dependencies.examination.saveNormDeconstruction({
        jurabk: input.jurabk,
        paragraph: input.paragraphNr,
        deconstruction: input.deconstruction,
      }),
    fetchProjectNorms: (projectId) => fetchProjectNormRefs(dependencies.projectLogic, projectId),
    processCachedNormDeconstructions: (input) => cachedNormBatches(dependencies, input),
    fetchDocumentNodes: (input) =>
      buildSuzDocuments(dependencies.examination, input.projectId, heartbeat),
    fetchNormData: (input) =>
      buildNormData(dependencies.examination, input.projectId, input.normId, heartbeat),
    fetchNormExaminationIds: (input) =>
      normExaminationIds(dependencies.examination, input.projectId, input.normId, heartbeat),
    fetchExistingDokumenteForSuz: (projectId) =>
      existingSuzDocuments(dependencies.examination, projectId),
    async resolveChunkDokumente(input) {
      const chunks = await batchResolve(
        dependencies.examination,
        input.projectId,
        input.chunkIds.map((id) => ({ nodeType: "chunk", id })),
        "chunk",
      );
      return Object.fromEntries(chunks.map((chunk) => [chunk.id, chunk.dokumentId]));
    },
    async writeSatzFundstellen(input) {
      return dependencies.examination
        .replaceFundstellen(input.projectId, input)
        .then((result) => ({ ...result, skipped: false, inserts: input.inserts }));
    },
  };
}
