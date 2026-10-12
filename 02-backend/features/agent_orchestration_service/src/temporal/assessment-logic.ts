import {type PFBChapter as PfbChapter, type RiskFinderOutput, type BewertungsWorkflowInput as BewertungsChildInput, type BewertungsWorkflowOutput as BewertungOutput, } from "@spark-temporal/contracts";

import {ASSESSMENT_LIMITS, type ArgumentClassificationOutput, type ArgumentExtractionOutput, type ArgumentRecord, type ArgumentTopic, type BewertungWorkflowInput, type BewertungWorkflowOutput, type EwmsDocuments, type EwmsEntrypointInput, type EwmsOrchestratorInput, type ExtractionStoreResponse, type GraphInsert, type InsertBewertungInput, type InsertBewertungSatzOutput, type InsertBewertungOutput, type MarkClassificationFailedInput, type NormContext, type ProcessBewertungenInput, type ProcessBewertungenOutput, type ProcessDocumentsEwmsOutput, type ReplaceProjectRisksOutput, type ReplaceVaeNodeRisksInput, type RisikohinweiseWorkflowInput, type RisikohinweiseWorkflowOutput, type StoreClassificationInput, type StoreExtractionInput, type StoreInjectionInput, type WriteBewertungSatzInput, } from "./assessment-contracts.ts";

async function concurrentMap<Input, Output>(
  values: readonly Input[],
  concurrency: number,
  action: (value: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (values.length === 0) return [];
  const output = Array.from<Output>({ length: values.length });
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), values.length) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= values.length) return;
        output[index] = await action(values[index]!, index);
      }
    },
  );
  await Promise.all(workers);
  return output;
}

export function buildBewertungSatzInputs(normContext: NormContext): BewertungsChildInput[] {
  return normContext.saetze.flatMap((satz) => {
    if (
      satz.fundstellen.length === 0 ||
      satz.normTypLvl1 !== "materiell-rechtlich" ||
      satz.normTypLvl2 !== "wenn-dann"
    ) {
      return [];
    }
    return [
      {
        gesetz: normContext.gesetzName,
        jurabk: normContext.jurabk,
        paragraphNr: normContext.paragraphNr,
        paragraphTitle: normContext.paragraphTitel,
        paragraphText: normContext.paragraphText,
        satzId: satz.satzId,
        satzText: satz.satzText,
        rechtsfolge: satz.rechtsfolge,
        atomareTbm: satz.atomareTbm,
        researchReport: null,
        originaltexte: satz.fundstellen.map((fundstelle) => ({
          documentId: fundstelle.dokumentId,
          nodeId: fundstelle.id,
          title: fundstelle.title,
          text: fundstelle.text,
          chunkIds: fundstelle.chunkIds,
          pageNumbers: fundstelle.pageNumbers,
        })),
      },
    ];
  });
}

export function mapBewertungResult(
  output: BewertungOutput,
  satzId: string,
  newId: () => string,
): BewertungWritePlan {
  const bewertungId = output.id;
  const markdownTextId = newId();
  const inserts: GraphInsert[] = [
    {
      nodeType: "markdown_text",
      id: markdownTextId,
      payload: { text: output.fullText },
    },
    {
      nodeType: "bewertung",
      id: bewertungId,
      payload: {
        satzId: satzId,
        result: output.result,
        kurzform: output.kurzform ?? null,
        norm: output.norm,
        markdownTextId: markdownTextId,
      },
    },
  ];
  output.kapitel.forEach((kapitel, order) => {
    inserts.push({
      nodeType: "bewertung_kapitel",
      id: kapitel.id,
      payload: {
        bewertungId: bewertungId,
        titel: kapitel.titel,
        markdown: kapitel.markdown,
        kurzform: kapitel.kurzform ?? null,
        order,
      },
    });
  });
  for (const [citedSvmId, source] of Object.entries(output.sources ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    inserts.push({
      nodeType: "bewertung_quelle",
      id: newId(),
      payload: {
        bewertungId: bewertungId,
        dokumentId: source.documentId,
        fundstelleId: source.nodeId || null,
        title: source.title,
        citedSvmId: citedSvmId,
        chunkIds: source.chunkIds ?? [],
        pageNumbers: source.pageNumbers ?? [],
      },
    });
  }
  return { bewertungId: bewertungId, inserts };
}

interface BewertungWritePlan {
  bewertungId: string;
  inserts: GraphInsert[];
}

export interface ProcessBewertungenDependencies {
  workflowId: string;
  concurrency?: number;
  runChild(input: BewertungsChildInput, childId: string): Promise<BewertungOutput>;
}

export async function runProcessBewertungenWorkflow(
  input: ProcessBewertungenInput,
  dependencies: ProcessBewertungenDependencies,
): Promise<ProcessBewertungenOutput> {
  const childInputs = buildBewertungSatzInputs(input.normContext);
  const eligible = new Set(childInputs.map(({ satzId }) => satzId));
  const skipped = input.normContext.saetze
    .filter(({ satzId }) => !eligible.has(satzId))
    .map(({ satzId }) => satzId);
  const sourcesBySatz = new Map(
    input.normContext.saetze.map((satz) => [
      satz.satzId,
      [
        {
          nodeType: "satz",
          id: satz.satzId,
          updatedAt: satz.updatedAt,
          digest: satz.digest,
          isOutdated: false,
        },
        ...satz.fundstellen.flatMap((source) => [
          {
            nodeType: "fundstelle",
            id: source.id,
            updatedAt: source.updatedAt,
            digest: source.digest,
            isOutdated: false,
          },
          {
            nodeType: "dokument",
            id: source.dokumentId,
            updatedAt: source.documentUpdatedAt,
            digest: source.documentDigest,
            isOutdated: false,
          },
        ]),
      ],
    ]),
  );
  const outputs = await concurrentMap(
    childInputs,
    dependencies.concurrency ?? ASSESSMENT_LIMITS.bewertungFanout,
    async (childInput, index) => ({
      satzId: childInput.satzId,
      sources: sourcesBySatz.get(childInput.satzId) ?? [],
      bewertungOutput: await dependencies.runChild(
        childInput,
        `${dependencies.workflowId}-satz-${index}`,
      ),
    }),
  );
  return { satzOutputs: outputs, skippedSatzIds: skipped };
}

export interface InsertBewertungDependencies {
  concurrency?: number;
  newId(): string;
  write(input: WriteBewertungSatzInput): Promise<InsertBewertungSatzOutput>;
}

export async function runInsertBewertungResultsWorkflow(
  input: InsertBewertungInput,
  dependencies: InsertBewertungDependencies,
): Promise<InsertBewertungOutput> {
  const results = await concurrentMap(
    input.satzOutputs,
    dependencies.concurrency ?? ASSESSMENT_LIMITS.bewertungInsertFanout,
    async (satz) => {
      const plan = mapBewertungResult(satz.bewertungOutput, satz.satzId, () =>
        dependencies.newId(),
      );
      if (plan.inserts.length === 0) {
        return {
          satzId: satz.satzId,
          bewertungId: "",
          nodesInserted: 0,
          skipped: true,
        };
      }
      return dependencies.write({
        projectId: input.projectId,
        satzId: satz.satzId,
        bewertungId: plan.bewertungId,
        sources: satz.sources,
        inserts: plan.inserts,
      });
    },
  );
  return { satzResults: results };
}

export interface BewertungWorkflowDependencies {
  workflowId: string;
  gather(input: BewertungWorkflowInput): Promise<NormContext>;
  startAndAwaitSuz(input: BewertungWorkflowInput): Promise<void>;
  process(input: ProcessBewertungenInput, childId: string): Promise<ProcessBewertungenOutput>;
  insert(input: InsertBewertungInput, childId: string): Promise<InsertBewertungOutput>;
}

export async function runBewertungWorkflow(
  input: BewertungWorkflowInput,
  dependencies: BewertungWorkflowDependencies,
): Promise<BewertungWorkflowOutput> {
  let context = await dependencies.gather(input);
  if (context.saetze.length === 0) {
    return { ...input, satzResults: [] };
  }
  if (
    context.saetze.some(({ needsRefresh }) => needsRefresh) ||
    !context.saetze.some(({ fundstellen }) => fundstellen.length > 0)
  ) {
    await dependencies.startAndAwaitSuz(input);
    context = await dependencies.gather(input);
    if (!context.saetze.some(({ fundstellen }) => fundstellen.length > 0)) {
      return { ...input, satzResults: [] };
    }
  }
  const processed = await dependencies.process(
    { normContext: context },
    `${dependencies.workflowId}-process`,
  );
  if (processed.satzOutputs.length === 0) {
    return { ...input, satzResults: [] };
  }
  const inserted = await dependencies.insert(
    { projectId: input.projectId, satzOutputs: processed.satzOutputs },
    `${dependencies.workflowId}-insert`,
  );
  return { ...input, satzResults: inserted.satzResults };
}

export interface EwmsOrchestratorDependencies {
  workflowId: string;
  concurrency?: number;
  newId(): string;
  runEntrypoint(input: EwmsEntrypointInput, childId: string): Promise<Record<string, never>>;
}

export async function runEwmsOrchestratorWorkflow(
  input: EwmsOrchestratorInput,
  dependencies: EwmsOrchestratorDependencies,
): Promise<Record<string, never>> {
  await concurrentMap(
    input.fileIds,
    dependencies.concurrency ?? ASSESSMENT_LIMITS.ewmsFanout,
    (fileId) =>
      dependencies.runEntrypoint(
        { projectId: input.projectId, fileId: fileId },
        `ewms-entrypoint-${dependencies.newId()}`,
      ),
  );
  return {};
}

export interface EwmsEntrypointDependencies {
  fetchDocuments(input: { projectId: string; fileIds: string[] }): Promise<EwmsDocuments>;
  processDocuments(input: {
    fileIds: string[];
    projectId: string;
  }): Promise<ProcessDocumentsEwmsOutput>;
  storeInjections(input: StoreInjectionInput): Promise<unknown>;
  extractArguments(input: {
    processedFilesOutput: ProcessDocumentsEwmsOutput["processedFilesOutput"];
  }): Promise<ArgumentExtractionOutput>;
  storeExtraction(input: StoreExtractionInput): Promise<ExtractionStoreResponse>;
  fetchTopics(projectId: string): Promise<ArgumentTopic[]>;
  classifyArguments(input: {
    argumentRecords: ArgumentRecord[];
    topics: ArgumentTopic[];
  }): Promise<ArgumentClassificationOutput>;
  storeClassification(input: StoreClassificationInput): Promise<unknown>;
  markClassificationFailed(input: MarkClassificationFailedInput): Promise<unknown>;
}

function extractionResultsByDocument(
  response: ExtractionStoreResponse,
): Map<string, ExtractionStoreResponse["results"][number]> {
  const output = new Map<string, ExtractionStoreResponse["results"][number]>();
  for (const result of response.results) {
    if (output.has(result.documentId)) {
      throw new Error(
        `OMS returned duplicate extraction result for document ${result.documentId}`,
      );
    }
    output.set(result.documentId, result);
  }
  return output;
}

export async function runEwmsEntrypointWorkflow(
  input: EwmsEntrypointInput,
  dependencies: EwmsEntrypointDependencies,
): Promise<Record<string, never>> {
  const documents = await dependencies.fetchDocuments({
    projectId: input.projectId,
    fileIds: [input.fileId],
  });
  const processed = await dependencies.processDocuments({
    projectId: input.projectId,
    fileIds: [input.fileId],
  });
  const clean = processed.processedFilesOutput.filter(
    ({ promptInjection }) => !promptInjection.injectionDetected,
  );
  const injected = processed.processedFilesOutput.filter(
    ({ promptInjection }) => promptInjection.injectionDetected,
  );
  if (injected.length > 0) {
    await dependencies.storeInjections({
      projectId: input.projectId,
      documents: injected.map((document) => ({
        fileId: document.originalFileId,
        documentName:
          documents.documentNamesById[document.originalFileId] ?? document.originalFileId,
        snippet: document.promptInjection.snippet,
      })),
    });
  }
  if (clean.length === 0) return {};

  const extraction = await dependencies.extractArguments({
    processedFilesOutput: clean,
  });
  const stored = await dependencies.storeExtraction({
    projectId: input.projectId,
    extractionOutput: extraction,
    documentNamesById: documents.documentNamesById,
    markdownById: Object.fromEntries(
      clean.map((document) => [document.originalFileId, document.markdown]),
    ),
  });
  const storedByDocument = extractionResultsByDocument(stored);
  const records: ArgumentRecord[] = [];
  const touchedIds: string[] = [];
  for (const document of extraction.documentArguments) {
    const persisted = storedByDocument.get(document.documentId);
    if (persisted === undefined) {
      throw new Error(`OMS returned no extraction result for document ${document.documentId}`);
    }
    if (persisted.skipped === true) continue;
    if (persisted.beteiligungsEingangId != null) {
      touchedIds.push(persisted.beteiligungsEingangId);
    }
    for (const { argumentId, extractedArgument } of persisted.arguments ?? []) {
      records.push({ argumentId, extractedArgument });
    }
  }
  if (records.length === 0) return {};

  const topics = await dependencies.fetchTopics(input.projectId);
  const failureInput = {
    projectId: input.projectId,
    beteiligungsEingangIds: touchedIds,
  };
  if (topics.length === 0) {
    if (touchedIds.length > 0) {
      await dependencies.markClassificationFailed(failureInput);
    }
    return {};
  }
  try {
    const classified = await dependencies.classifyArguments({
      argumentRecords: records,
      topics,
    });
    await dependencies.storeClassification({
      projectId: input.projectId,
      classificationOutput: classified,
    });
  } catch {
    if (touchedIds.length > 0) {
      await dependencies.markClassificationFailed(failureInput);
    }
  }
  return {};
}

export interface RisikohinweiseDependencies {
  fetchChapter(input: RisikohinweiseWorkflowInput): Promise<PfbChapter | null>;
  runRiskChild(chapter: PfbChapter): Promise<RiskFinderOutput>;
  replaceRisks(input: ReplaceVaeNodeRisksInput): Promise<ReplaceProjectRisksOutput>;
}

export async function runRisikohinweiseWorkflow(
  input: RisikohinweiseWorkflowInput,
  dependencies: RisikohinweiseDependencies,
): Promise<RisikohinweiseWorkflowOutput> {
  const chapter = await dependencies.fetchChapter(input);
  const childOutput: RiskFinderOutput | null =
    chapter === null ? null : await dependencies.runRiskChild(chapter);
  const replacement = await dependencies.replaceRisks({
    projectId: input.projectId,
    vaeNodeId: input.vaeNodeId,
    risks: (childOutput?.risks ?? []).map((risk) => ({
      id: risk.riskId,
      vaeNodeId: risk.chapterId,
      problem: risk.description,
      recommendation: risk.recommendation,
      quote: risk.quote,
      severity: risk.severity,
      implication: risk.implications,
      status: null,
    })),
  });
  return {
    projectId: input.projectId,
    chaptersProcessed: chapter === null ? 0 : 1,
    risksPersisted: replacement.insertedCount,
  };
}
