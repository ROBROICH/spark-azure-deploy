import { processingSourceDigest } from "@spark-workflow/examination-service/resource";
import type { ExaminationNode } from "@spark-workflow/examination-service";
import type { RiskMutationInput } from "@spark-workflow/administrative-file-draft";
import { heartbeat as temporalHeartbeat } from "@temporalio/activity";
import { ApplicationFailure } from "@temporalio/common";
import {
  AGENT_ORCHESTRATION_SUCHE_ZUORDNUNG_NORM_WORKFLOW,
  AGENT_ORCHESTRATION_TASK_QUEUE,
  type AtomaresTBM,
  type PFBChapter as PfbChapter,
  type Rechtsfolge,
  type Verweise,
} from "@spark-temporal/contracts";
import {
  readTemporalFixture,
  TemporalFixtureDeclaredError,
  TemporalFixtureMatchError,
  TemporalFixtureValidationError,
} from "@spark-temporal/typescript/caller";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { type FileObject, type GraphReference } from "../schemas.ts";
import {
  AssessmentTemporalErrorSchema,
  SuzAwaitInputSchema,
  SuzAwaitResultSchema,
  type ArgumentTopic,
  type EwmsDocuments,
  type ExtractionStoreResponse,
  type FetchEwmsDocumentsInput,
  type GraphInsert,
  type MarkClassificationFailedInput,
  type NormContext,
  type ReplaceProjectRisksOutput,
  type ReplaceVaeNodeRisksInput,
  type StoreClassificationInput,
  type StoreExtractionInput,
  type StoreInjectionInput,
  type SuzAwaitInput,
  type SuzAwaitResult,
  type WriteBewertungSatzInput,
} from "./assessment-contracts.ts";

import type { ClassificationBody } from "@spark-workflow/objections-management-service/resource";
import type { AosObjectionsService, AosObjectionsUpdateResult } from "../objections.ts";
import { projectVersion, type createAosInternalActivityDependencies } from "../internal-services.ts";
import type { AosActivityDependencies } from "./activities.ts";
import { workflowId } from "./workflow-id.ts";
type NodeRef = { nodeType: string; id: string };

type InternalDependencies = ReturnType<typeof createAosInternalActivityDependencies>;
type GraphBoundary = Pick<
  AosActivityDependencies["examination"],
  "listNodes" | "batchGetNodes" | "updateNodes" | "replaceAssessment"
>;

export interface AssessmentActivityDependencies {
  examination: GraphBoundary;
  dms: { getFileById(fileId: string): Promise<FileObject> };
  projectLogic: Pick<AosActivityDependencies["projectLogic"], "listNodes" | "batchGetNodes">;
  objections: AosObjectionsService;
  administrativeFileDraft: Pick<
    InternalDependencies["administrativeFileDraft"],
    "batchGetNodes" | "getRisks"
  > & {
    updateNodes(
      projectId: string,
      mutation: RiskMutationInput,
    ): Promise<{
      inserted?: readonly unknown[];
      updated?: readonly unknown[];
      deleted?: readonly unknown[];
    }>;
  };
  suz: { startAndAwait(input: SuzAwaitInput): Promise<SuzAwaitResult> };
}

export interface AssessmentActivityOptions {
  heartbeat?: (detail: string) => void;
  heartbeatIntervalMs?: number;
}

export interface AssessmentActivities {
  gatherNormContext(input: { projectId: string; normId: string }): Promise<NormContext>;
  writeBewertungSatzResult(input: WriteBewertungSatzInput): Promise<{
    satzId: string;
    bewertungId: string;
    nodesInserted: number;
    skipped: boolean;
  }>;
  startAndAwaitSuz(input: { projectId: string; normId: string }): Promise<void>;
  _fetch_ewms_documents(input: FetchEwmsDocumentsInput): Promise<EwmsDocuments>;
  _fetch_processed_file_ids(projectId: string): Promise<string[]>;
  _fetch_argument_topics(projectId: string): Promise<ArgumentTopic[]>;
  _store_extraction_results(input: StoreExtractionInput): Promise<ExtractionStoreResponse>;
  _store_classification_results(
    input: StoreClassificationInput,
  ): Promise<AosObjectionsUpdateResult>;
  _store_injection_results(input: StoreInjectionInput): Promise<AosObjectionsUpdateResult>;
  _mark_classification_failed(
    input: MarkClassificationFailedInput,
  ): Promise<AosObjectionsUpdateResult>;
  _fetch_risikohinweis_chapter(input: {
    projectId: string;
    vaeNodeId: string;
  }): Promise<PfbChapter | null>;
  _replace_vae_node_risks(input: ReplaceVaeNodeRisksInput): Promise<ReplaceProjectRisksOutput>;
}

async function batchType<Key extends Parameters<GraphBoundary["batchGetNodes"]>[2]>(
  peer: Pick<GraphBoundary, "batchGetNodes">,
  projectId: string,
  nodes: readonly GraphReference[],
  nodeType: string,
  table: Key,
) {
  const refs = nodes
    .filter((node) => node.nodeType === nodeType)
    .map((node) => ({ nodeType, id: node.id }));
  return refs.length === 0 ? [] : (await peer.batchGetNodes(projectId, refs, table)).results;
}

function grouped<Node, Field extends keyof Node>(nodes: readonly Node[], field: Field) {
  const output = new Map<Node[Field], Node[]>();
  for (const node of nodes) {
    const key = node[field];
    if (key == null) continue;
    const values = output.get(key) ?? [];
    values.push(node);
    output.set(key, values);
  }
  return output;
}

function reconstructVerweise(
  parentId: string,
  explicitByParent: Map<string | null, ExaminationNode<"expliziterVerweis">[]>,
  implicitByParent: Map<string | null, ExaminationNode<"impliziterVerweis">[]>,
): Verweise {
  return {
    explizit: (explicitByParent.get(parentId) ?? []).map((item) => {
      const untergliederung = Array.isArray(item.untergliederung)
        ? item.untergliederung.map((value) => {
            const row = Value.Parse(
              Type.Object(
                { typ: Type.String(), wert: Type.String() },
                { additionalProperties: true },
              ),
              value ?? {},
            );
            return {
              typ: `${row.typ ?? ""}`,
              wert: `${row.wert ?? ""}`,
            };
          })
        : [];
      return {
        gesetz: item.gesetz == null ? null : `${item.gesetz}`,
        paragraphNr: item.paragraphNr == null ? null : `${item.paragraphNr}`,
        absatzNr: item.absatzNr == null ? null : `${item.absatzNr}`,
        satzNr: item.satzNr == null ? null : `${item.satzNr}`,
        untergliederung: untergliederung.length === 0 ? null : untergliederung,
        anhang: null,
        artikel: null,
        richtlinie: null,
        verordnung: null,
        technischeNorm: null,
        verweisTyp:
          item.verweisTyp === "intern" || item.verweisTyp === "extern" ? item.verweisTyp : null,
        kontext: Array.isArray(item.kontext) ? item.kontext.map((entry) => `${entry ?? ""}`) : null,
      };
    }),
    implizit: (implicitByParent.get(parentId) ?? []).map((item) => `${item.rationale ?? ""}`),
  };
}

function reconstructTbm(
  tbm: ExaminationNode<"atomaresTbm">,
  indices: {
    bestemmt: Map<string | null, ExaminationNode<"bestimmterRechtsbegriff">[]>;
    definitions: Map<string | null, ExaminationNode<"legaldefinition">[]>;
    unbestimmt: Map<string | null, ExaminationNode<"unbestimmterRechtsbegriff">[]>;
    interpretation: Map<string | null, ExaminationNode<"auslegungsvorschlag">[]>;
    explicit: Map<string | null, ExaminationNode<"expliziterVerweis">[]>;
    implicit: Map<string | null, ExaminationNode<"impliziterVerweis">[]>;
  },
): AtomaresTBM {
  const id = `${tbm.id ?? ""}`;
  return {
    id,
    text: `${tbm.text ?? ""}`,
    verweise: reconstructVerweise(id, indices.explicit, indices.implicit),
    prueffrage: `${tbm.prueffrage ?? ""}`,
    pruefgegenstand: `${tbm.pruefgegenstand ?? ""}`,
    rechtsbegriffe: {
      bestimmteRechtsbegriffe: (indices.bestemmt.get(id) ?? []).map((term) => ({
        begriff: `${term.begriff ?? ""}`,
        definitions: (indices.definitions.get(`${term.id ?? ""}`) ?? []).map((definition) => ({
          begriff: `${definition.begriff ?? ""}`,
          definition: `${definition.definition ?? ""}`,
          source: {
            jurabk: `${definition.sourceJurabk ?? ""}`,
            paragraphNr: `${definition.sourceParagraphNr ?? ""}`,
          },
        })),
        selectedDefinition: null,
      })),
      unbestimmteRechtsbegriffe: (indices.unbestimmt.get(id) ?? []).map((term) => ({
        begriff: `${term.begriff ?? ""}`,
        auslegung: term.auslegung == null ? null : `${term.auslegung}`,
        auslegungsvorschläge: (indices.interpretation.get(`${term.id ?? ""}`) ?? []).map(
          (suggestion) => ({
            auslegungMethode: `${suggestion.methode ?? ""}`,
            auslegungsvorschlag: `${suggestion.text ?? ""}`,
            sources: null,
          }),
        ),
      })),
    },
  };
}

function reconstructRechtsfolge(
  value: ExaminationNode<"rechtsfolge">,
  indices: {
    categories: Map<string | null, ExaminationNode<"sollensanordnungen">[]>;
    addressees: Map<string | null, ExaminationNode<"adressat">[]>;
    discretion: Map<string | null, ExaminationNode<"ermessensspielraum">[]>;
    discretionKind: Map<string | null, ExaminationNode<"ermessensart">[]>;
    explicit: Map<string | null, ExaminationNode<"expliziterVerweis">[]>;
    implicit: Map<string | null, ExaminationNode<"impliziterVerweis">[]>;
  },
): Rechtsfolge | null {
  const id = `${value.id ?? ""}`;
  const category = indices.categories.get(id)?.[0];
  const addressee = indices.addressees.get(id)?.[0];
  if (category === undefined || addressee === undefined) return null;
  const verweise = reconstructVerweise(id, indices.explicit, indices.implicit);
  const discretion = indices.discretion.get(id)?.[0]?.entscheidung;
  const discretionKind = indices.discretionKind.get(id)?.[0]?.art;
  return {
    text: `${value.text ?? ""}`,
    sollensanordnungen: category.kategorie,
    rechtsfolgenAdressat: addressee.entscheidung,
    ermessensspielraum: discretion ?? null,
    ermessensart: discretionKind ?? null,
    verweise: verweise.explizit.length === 0 && verweise.implizit.length === 0 ? null : verweise,
  };
}

async function gatherNormContext(
  examination: GraphBoundary,
  projectId: string,
  normId: string,
): Promise<NormContext> {
  const graph = await examination.listNodes(projectId);
  const [
    laws,
    norms,
    paragraphs,
    sentences,
    atomicConditions,
    legalConsequences,
    sources,
    documents,
    definedTerms,
    definitions,
    undefinedTerms,
    interpretations,
    explicitReferences,
    implicitReferences,
    categories,
    addressees,
    discretions,
    discretionKinds,
  ] = await Promise.all([
    batchType(examination, projectId, graph.nodes, "gesetz", "gesetz"),
    batchType(examination, projectId, graph.nodes, "norm", "norm"),
    batchType(examination, projectId, graph.nodes, "absatz", "absatz"),
    batchType(examination, projectId, graph.nodes, "satz", "satz"),
    batchType(examination, projectId, graph.nodes, "atomares_tbm", "atomaresTbm"),
    batchType(examination, projectId, graph.nodes, "rechtsfolge", "rechtsfolge"),
    batchType(examination, projectId, graph.nodes, "fundstelle", "fundstelle"),
    batchType(examination, projectId, graph.nodes, "dokument", "dokument"),
    batchType(
      examination,
      projectId,
      graph.nodes,
      "bestimmter_rechtsbegriff",
      "bestimmterRechtsbegriff",
    ),
    batchType(examination, projectId, graph.nodes, "legaldefinition", "legaldefinition"),
    batchType(
      examination,
      projectId,
      graph.nodes,
      "unbestimmter_rechtsbegriff",
      "unbestimmterRechtsbegriff",
    ),
    batchType(examination, projectId, graph.nodes, "auslegungsvorschlag", "auslegungsvorschlag"),
    batchType(examination, projectId, graph.nodes, "expliziter_verweis", "expliziterVerweis"),
    batchType(examination, projectId, graph.nodes, "impliziter_verweis", "impliziterVerweis"),
    batchType(examination, projectId, graph.nodes, "sollensanordnungen", "sollensanordnungen"),
    batchType(examination, projectId, graph.nodes, "adressat", "adressat"),
    batchType(examination, projectId, graph.nodes, "ermessensspielraum", "ermessensspielraum"),
    batchType(examination, projectId, graph.nodes, "ermessensart", "ermessensart"),
  ]);
  const norm = norms.find((item) => `${item.id ?? ""}` === normId);
  if (norm === undefined) {
    throw new Error(`Norm ${normId} not found in project ${projectId}`);
  }
  const lawId = `${norm.gesetzId ?? ""}`;
  const law = laws.find((item) => `${item.id ?? ""}` === lawId);
  if (law === undefined) {
    throw new Error(`Gesetz ${lawId} not found for norm ${normId}`);
  }
  const chunkIds = new Set(
    sources.flatMap((item) =>
      Array.isArray(item.chunkIds) ? item.chunkIds.map((id) => `${id ?? ""}`) : [],
    ),
  );
  const chunks =
    chunkIds.size === 0
      ? []
      : (
          await examination.batchGetNodes(
            projectId,
            [...chunkIds].map((id) => ({ nodeType: "chunk", id })),
            "chunk",
          )
        ).results;
  const chunkOrder = new Map(chunks.map((item) => [`${item.id ?? ""}`, Number(item.order)]));
  const absaetze = grouped(paragraphs, "normId").get(normId) ?? [];
  const saetze = grouped(sentences, "absatzId");
  const tbms = grouped(atomicConditions, "satzId");
  const rechtsfolgen = grouped(legalConsequences, "satzId");
  const fundstellen = grouped(sources, "satzId");
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const explicit = explicitReferences;
  const implicit = implicitReferences;
  const tbmIndices = {
    bestemmt: grouped(definedTerms, "atomaresTbmId"),
    definitions: grouped(definitions, "bestimmterRechtsbegriffId"),
    unbestimmt: grouped(undefinedTerms, "atomaresTbmId"),
    interpretation: grouped(interpretations, "unbestimmterRechtsbegriffId"),
    explicit: grouped(explicit, "atomaresTbmId"),
    implicit: grouped(implicit, "atomaresTbmId"),
  };
  const rfIndices = {
    categories: grouped(categories, "rechtsfolgeId"),
    addressees: grouped(addressees, "rechtsfolgeId"),
    discretion: grouped(discretions, "rechtsfolgeId"),
    discretionKind: grouped(discretionKinds, "rechtsfolgeId"),
    explicit: grouped(explicit, "rechtsfolgeId"),
    implicit: grouped(implicit, "rechtsfolgeId"),
  };
  const satzContexts = absaetze.flatMap((absatz) =>
    (saetze.get(`${absatz.id ?? ""}`) ?? []).map((satz) => {
      const satzId = `${satz.id ?? ""}`;
      const sourceRows = [...(fundstellen.get(satzId) ?? [])].sort((left, right) => {
        const document = `${left.dokumentId ?? ""}`.localeCompare(`${right.dokumentId ?? ""}`);
        if (document !== 0) return document;
        const minimum = (row: ExaminationNode<"fundstelle">) =>
          Math.min(
            ...(Array.isArray(row.chunkIds)
              ? row.chunkIds.map((id) => chunkOrder.get(`${id ?? ""}`) ?? Number.POSITIVE_INFINITY)
              : [Number.POSITIVE_INFINITY]),
          );
        return (
          minimum(left) - minimum(right) || `${left.id ?? ""}`.localeCompare(`${right.id ?? ""}`)
        );
      });
      const rechtsfolge = rechtsfolgen.get(satzId)?.[0];
      return {
        satzId: satzId,
        satzText: `${satz.text ?? ""}`,
        updatedAt: satz.updatedAt.toISOString(),
        digest: processingSourceDigest(satz),
        needsRefresh: sourceRows.some(
          (source) =>
            source.isOutdated || documentsById.get(source.dokumentId)?.isOutdated !== false,
        ),
        normTypLvl1: satz.normTypLvl1 == null ? null : `${satz.normTypLvl1}`,
        normTypLvl2: satz.normTypLvl2 == null ? null : `${satz.normTypLvl2}`,
        atomareTbm: (tbms.get(satzId) ?? []).map((item) => reconstructTbm(item, tbmIndices)),
        rechtsfolge:
          rechtsfolge === undefined ? null : reconstructRechtsfolge(rechtsfolge, rfIndices),
        fundstellen: sourceRows.flatMap((source) => {
          const document = documentsById.get(source.dokumentId);
          if (source.isOutdated || document === undefined || document.isOutdated) return [];
          return [
            {
              id: `${source.id ?? ""}`,
              dokumentId: `${source.dokumentId ?? ""}`,
              title: `${source.title ?? ""}`,
              text: `${source.text ?? ""}`,
              updatedAt: source.updatedAt.toISOString(),
              digest: processingSourceDigest(source),
              documentUpdatedAt: document.updatedAt.toISOString(),
              documentDigest: processingSourceDigest(document),
              chunkIds: Array.isArray(source.chunkIds)
                ? source.chunkIds.map((id) => `${id ?? ""}`)
                : [],
              pageNumbers: Array.isArray(source.pageNumbers)
                ? source.pageNumbers.map((item) => Number(item))
                : [],
            },
          ];
        }),
      };
    }),
  );
  return {
    gesetzName: `${law.name ?? ""}`,
    jurabk: `${law.jurabk ?? ""}`,
    paragraphNr: `${norm.paragraphNr ?? ""}`,
    paragraphTitel: `${norm.paragraphTitel ?? ""}`,
    paragraphText: `${norm.text ?? ""}`,
    saetze: satzContexts,
  };
}

function key({ nodeType, id }: NodeRef): string {
  return `${nodeType}:${id}`;
}

async function sanitizeBewertungSources(
  examination: GraphBoundary,
  projectId: string,
  inserts: readonly GraphInsert[],
): Promise<GraphInsert[]> {
  const sources = inserts.flatMap((insert) =>
    insert.nodeType === "bewertung_quelle" ? [insert] : [],
  );
  if (sources.length === 0) return [...inserts];
  const refs = sources.flatMap(({ payload }) => {
    const documentId = payload.dokumentId;
    const fundstelleId = payload.fundstelleId ?? "";
    return [
      ...(documentId === "" ? [] : [{ nodeType: "dokument", id: documentId }]),
      ...(fundstelleId === "" ? [] : [{ nodeType: "fundstelle", id: fundstelleId }]),
    ];
  });
  const unique = [...new Map(refs.map((item) => [key(item), item])).values()];
  const existing = (await examination.listNodes(projectId)).nodes.filter((node) =>
    unique.some((ref) => key(ref) === key(node)),
  );
  const keys = new Set(existing.map((item) => `${item.nodeType}:${item.id}`));
  const next: GraphInsert[] = [];
  for (const insert of inserts) {
    if (insert.nodeType !== "bewertung_quelle") {
      next.push(insert);
      continue;
    }
    const documentId = insert.payload.dokumentId;
    if (documentId === "" || !keys.has(`dokument:${documentId}`)) continue;
    const fundstelleId = insert.payload.fundstelleId ?? "";
    next.push({
      ...insert,
      payload: {
        ...insert.payload,
        fundstelleId:
          fundstelleId !== "" && keys.has(`fundstelle:${fundstelleId}`) ? fundstelleId : null,
      },
    });
  }
  return next;
}

async function writeBewertung(examination: GraphBoundary, input: WriteBewertungSatzInput) {
  const inserts = await sanitizeBewertungSources(examination, input.projectId, input.inserts);
  const result = await examination.replaceAssessment(input.projectId, { ...input, inserts });
  return {
    satzId: input.satzId,
    bewertungId: input.bewertungId,
    nodesInserted: result.nodesInserted,
    skipped: false,
  };
}

function parentId(
  graph: readonly GraphReference[],
  nodeId: string,
  parentType: string,
): string | undefined {
  return graph
    .find(({ id }) => id === nodeId)
    ?.parents?.find(({ nodeType }) => nodeType === parentType)?.id;
}

export const ASSESSMENT_TEMPORAL_OPERATIONS = {
  awaitSuz: "agent-orchestration.suz-norm.start-and-await",
};

async function awaitWithHeartbeat<Result>(
  action: Promise<Result>,
  heartbeat: (detail: string) => void,
  detail: string,
  intervalMs: number,
): Promise<Result> {
  heartbeat(detail);
  const interval = setInterval(() => heartbeat(detail), intervalMs);
  try {
    return await action;
  } finally {
    clearInterval(interval);
  }
}

export function createAssessmentActivities(
  dependencies: AssessmentActivityDependencies,
  options: AssessmentActivityOptions = {},
): AssessmentActivities {
  const heartbeat = options.heartbeat ?? temporalHeartbeat;
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 60_000;
  return {
    gatherNormContext: ({ projectId, normId }) =>
      gatherNormContext(dependencies.examination, projectId, normId),
    writeBewertungSatzResult: (input) => writeBewertung(dependencies.examination, input),
    async startAndAwaitSuz(input) {
      const version = projectVersion(input.projectId);
      const command: SuzAwaitInput = {
        ...input,
        projectVersion: version,
        executionId: workflowId(
          AGENT_ORCHESTRATION_SUCHE_ZUORDNUNG_NORM_WORKFLOW,
          input.projectId,
          version,
          input.normId,
        ),
        workflowName: AGENT_ORCHESTRATION_SUCHE_ZUORDNUNG_NORM_WORKFLOW,
        taskQueue: AGENT_ORCHESTRATION_TASK_QUEUE,
        idReusePolicy: "ALLOW_DUPLICATE",
        idConflictPolicy: "USE_EXISTING",
        priority: { fairnessKey: "priority", fairnessWeight: 2 },
      };
      const waiting = `waiting for ${command.executionId}`;
      try {
        const fixture = readTemporalFixture(ASSESSMENT_TEMPORAL_OPERATIONS.awaitSuz, command, {
          input: SuzAwaitInputSchema,
          result: SuzAwaitResultSchema,
          error: AssessmentTemporalErrorSchema,
        });
        if (fixture === undefined) {
          await awaitWithHeartbeat(
            dependencies.suz.startAndAwait(command),
            heartbeat,
            waiting,
            heartbeatIntervalMs,
          );
        } else {
          heartbeat(waiting);
        }
      } catch (error) {
        if (
          error instanceof TemporalFixtureMatchError ||
          error instanceof TemporalFixtureValidationError
        ) {
          heartbeat(waiting);
          throw error;
        }
        if (error instanceof TemporalFixtureDeclaredError) {
          heartbeat(waiting);
          throw ApplicationFailure.nonRetryable(error.message, "SuzWorkflowFailed", error.outcome);
        }
        const message = error instanceof Error ? error.message : String(error);
        throw ApplicationFailure.nonRetryable(
          `${ASSESSMENT_TEMPORAL_OPERATIONS.awaitSuz}: ${message}`,
          "SuzWorkflowFailed",
          { code: "SUZ_WORKFLOW_FAILED", message },
        );
      }
      heartbeat(`completed ${command.executionId}`);
    },
    async _fetch_ewms_documents(input) {
      const files = await Promise.all(input.fileIds.map((id) => dependencies.dms.getFileById(id)));
      const invalid = files.filter(
        (file) => file.projectId !== input.projectId || file.type !== "ewms_document",
      );
      if (invalid.length > 0) {
        throw new Error(
          `EWMS workflow received file IDs that are not EWMS documents for project ${input.projectId}: ${invalid.map(({ id }) => id).join(", ")}`,
        );
      }
      return {
        fileIds: input.fileIds,
        documentNamesById: Object.fromEntries(files.map((file) => [file.id, file.filename])),
      };
    },
    _fetch_processed_file_ids: (projectId) =>
      dependencies.objections.listProcessedFileIds(projectId),
    async _fetch_argument_topics(projectId) {
      const graph = await dependencies.projectLogic.listNodes(projectId);
      const refs = graph.nodes
        .filter(({ nodeType }) => nodeType === "topic" || nodeType === "subtopic")
        .map(({ nodeType, id }) => ({ nodeType, id }));
      if (refs.length === 0) return [];
      const [topicRows, subtopicRows] = await Promise.all([
        dependencies.projectLogic.batchGetNodes(
          projectId,
          refs.filter((ref) => ref.nodeType === "topic"),
          "topics",
        ),
        dependencies.projectLogic.batchGetNodes(
          projectId,
          refs.filter((ref) => ref.nodeType === "subtopic"),
          "subtopics",
        ),
      ]);
      const topics = topicRows.results.filter((item) => item.showInEwm);
      const subtopics = subtopicRows.results.filter((item) => item.showInEwm);
      return topics.map((topic) => ({
        topicId: `${topic.id ?? ""}`,
        name: `${topic.name ?? ""}`,
        description: `${topic.description ?? ""}`,
        subtopics: subtopics
          .filter(
            (subtopic) =>
              parentId(graph.nodes, `${subtopic.id ?? ""}`, "topic") === `${topic.id ?? ""}`,
          )
          .map((subtopic) => ({
            topicId: `${subtopic.id ?? ""}`,
            name: `${subtopic.name ?? ""}`,
            description: `${subtopic.description ?? ""}`,
          })),
      }));
    },
    async _store_extraction_results(input) {
      const payload = {
        ...input.extractionOutput,
        documentArguments: input.extractionOutput.documentArguments.map((document) => ({
          ...document,
          documentName: input.documentNamesById[document.documentId] ?? document.documentId,
          beteiligungsEingangMarkdown: input.markdownById[document.documentId] ?? null,
        })),
      };
      return dependencies.objections.storeExtractionResults(input.projectId, payload);
    },
    _store_classification_results(input) {
      const classified: ClassificationBody["classifiedArguments"] = [];
      const unclassified: string[] = [];
      for (const result of input.classificationOutput.classifiedArguments) {
        if (result.topic === null) {
          unclassified.push(result.argumentRecord.argumentId);
        } else {
          classified.push({
            argumentId: result.argumentRecord.argumentId,
            topicId: result.topic.topicId,
            subTopicId: result.subtopic?.topicId ?? null,
            topicConfidence: result.topicConfidence,
            subTopicConfidence: result.subtopicConfidence,
          });
        }
      }
      return dependencies.objections.storeClassificationResults(input.projectId, {
        classifiedArguments: classified,
        unclassifiedArgumentIds: unclassified,
      });
    },
    _store_injection_results: (input) =>
      dependencies.objections.markInjectionDetected(input.projectId, {
        documents: input.documents,
      }),
    _mark_classification_failed: (input) =>
      dependencies.objections.markClassificationFailed(input.projectId, {
        beteiligungsEingangIds: input.beteiligungsEingangIds,
      }),
    async _fetch_risikohinweis_chapter(input) {
      const result = await dependencies.administrativeFileDraft.batchGetNodes(
        input.projectId,
        [{ nodeType: "vae_node", id: input.vaeNodeId }],
        "vaeNodes",
      );
      const node = result.results[0];
      if (node === undefined) {
        return null;
      }
      if (node.id !== input.vaeNodeId || node.isHidden || node.text.trim().length === 0) {
        return null;
      }
      return {
        id: input.vaeNodeId,
        title: node.title,
        text: node.text,
      };
    },
    async _replace_vae_node_risks(input) {
      const existing = await dependencies.administrativeFileDraft.getRisks(input.projectId);
      const own = existing.filter(({ vaeNodeId }) => vaeNodeId === input.vaeNodeId);
      const statusById = new Map(own.map((risk) => [risk.id, risk.status]));
      const inserts = input.risks.map((risk) => {
        const status = risk.status ?? statusById.get(risk.id) ?? "open";
        const payload = {
          vaeNodeId: risk.vaeNodeId,
          problem: risk.problem,
          severity: risk.severity,
          implication: risk.implication,
          recommendation: risk.recommendation,
          quote: risk.quote,
          status,
        };
        return {
          nodeType: "risks",
          id: risk.id,
          payload,
        } satisfies NonNullable<RiskMutationInput["inserts"]>[number];
      });
      const expectedIds = new Set(inserts.map(({ id }) => id));
      const existingIds = new Set(own.map(({ id }) => id));
      if (
        expectedIds.size > 0 &&
        expectedIds.size === existingIds.size &&
        [...expectedIds].every((id) => existingIds.has(id))
      ) {
        return { deletedCount: 0, insertedCount: inserts.length };
      }
      const deletes = own.map(({ id }) => ({ nodeType: "risks", id }));
      if (inserts.length === 0 && deletes.length === 0) {
        return { deletedCount: 0, insertedCount: 0 };
      }
      const result = await dependencies.administrativeFileDraft.updateNodes(input.projectId, {
        inserts,
        deletes,
      });
      return {
        deletedCount: Array.isArray(result.deleted) ? result.deleted.length : deletes.length,
        insertedCount: Array.isArray(result.inserted) ? result.inserted.length : inserts.length,
      };
    },
  };
}
