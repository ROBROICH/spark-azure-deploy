import { ApplicationFailure, isCancellation } from "@temporalio/workflow";
import {
  buildRechtsmethodikWritePlan,
  mapFundstellen,
  type ExaminationTopicNorm,
  type RechtsmethodikWorkflowOutput as RechtsmethodikResult,
  type SatzOrchestratorWorkflowInput as SatzChildInput,
  type SatzOrchestratorWorkflowOutput as SatzChildOutput,
  type SucheZuordnungNormData as NormData,
} from "@spark-temporal/contracts";

import {
  NORM_LIMITS,
  type BatchMvpWorkflowInput,
  type BatchMvpWorkflowOutput,
  type CachedNormBatchInput,
  type CachedNormBatchOutput,
  type InsertRechtsmethodikResultOutput,
  type InsertRechtsmethodikResultsInput,
  type InsertSuzResultsInput,
  type InsertSuzResultsOutput,
  type MvpWorkflowInput,
  type MvpWorkflowOutput,
  type NormRef,
  type NormExaminationIds,
  type ExaminationRechtsmethodikContext,
  type RechtsmethodikChildInput,
  type SuzDocuments,
  type SuzWorkflowInput,
  type SuzWorkflowOutput,
  type WriteSatzFundstellenInput,
} from "./norm-contracts.ts";

export async function boundedMap<Input, Output>(
  items: readonly Input[],
  concurrency: number,
  callback: (item: Input, index: number) => Promise<Output>,
): Promise<Output[]> {
  if (items.length === 0) return [];
  const results = Array.from<Output>({ length: items.length });
  let nextIndex = 0;
  const worker = async () => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      results[index] = await callback(items[index]!, index);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => worker()),
  );
  return results;
}

export interface MvpOperations {
  workflowId: string;
  getNormDeconstruction(
    input: RechtsmethodikChildInput,
  ): Promise<RechtsmethodikResult | null | undefined>;
  runRechtsmethodik(
    input: RechtsmethodikChildInput,
    childId: string,
  ): Promise<RechtsmethodikResult>;
  saveNormDeconstruction(input: {
    jurabk: string;
    paragraphNr: string;
    deconstruction: RechtsmethodikResult;
  }): Promise<void>;
  insertRechtsmethodikResults(
    input: InsertRechtsmethodikResultsInput,
    childId: string,
  ): Promise<InsertRechtsmethodikResultOutput[]>;
}

export async function runMvpWorkflow(
  input: MvpWorkflowInput,
  operations: MvpOperations,
): Promise<MvpWorkflowOutput> {
  const childInput = {
    jurabk: input.jurabk,
    paragraphNr: input.paragraphNr,
  };
  const cached = await operations.getNormDeconstruction(childInput);
  let result = cached;
  if (result === null || result === undefined) {
    result = await operations.runRechtsmethodik(
      childInput,
      `${operations.workflowId}-rechtsmethodik`,
    );
    await operations.saveNormDeconstruction({
      ...childInput,
      deconstruction: result,
    });
  }
  const inserted = await operations.insertRechtsmethodikResults(
    { projectId: input.projectId, normResults: [result] },
    `${operations.workflowId}-insert-rm`,
  );
  const first: InsertRechtsmethodikResultOutput | undefined = inserted[0];
  if (first === undefined) {
    throw new Error("Rechtsmethodik insertion returned no norm result");
  }
  return {
    projectId: input.projectId,
    jurabk: input.jurabk,
    paragraphNr: input.paragraphNr,
    skipped: first.normId === null ? true : first.skipped,
    gesetzId: first.gesetzId,
    normId: first.normId,
  };
}

export interface BatchMvpOperations {
  workflowId: string;
  fetchProjectNorms(projectId: string): Promise<NormRef[]>;
  processCachedNormDeconstructions(input: CachedNormBatchInput): Promise<CachedNormBatchOutput>;
  runMvp(input: MvpWorkflowInput, childId: string, index: number): Promise<MvpWorkflowOutput>;
}

export async function runBatchMvpWorkflow(
  input: BatchMvpWorkflowInput,
  operations: BatchMvpOperations,
): Promise<BatchMvpWorkflowOutput> {
  const norms = await operations.fetchProjectNorms(input.projectId);
  if (norms.length === 0) {
    return { projectId: input.projectId, results: [] };
  }
  const cached = await operations.processCachedNormDeconstructions({
    projectId: input.projectId,
    norms,
  });
  let cancellation: unknown;
  const childResults = await boundedMap(
    cached.uncachedNorms,
    NORM_LIMITS.batchMvp,
    async (norm, index): Promise<MvpWorkflowOutput | null> => {
      if (cancellation !== undefined) throw cancellation;
      try {
        return await operations.runMvp(
          {
            projectId: input.projectId,
            jurabk: norm.jurabk,
            paragraphNr: norm.paragraphNr,
          },
          `${operations.workflowId}-mvp-${index}`,
          index,
        );
      } catch (error) {
        if (isCancellation(error)) {
          cancellation = error;
          throw error;
        }
        return null;
      }
    },
  );
  const failedNorms = cached.uncachedNorms.flatMap((norm, index) =>
    childResults[index] === null ? [{ jurabk: norm.jurabk, paragraphNr: norm.paragraphNr }] : [],
  );
  if (failedNorms.length > 0) {
    throw ApplicationFailure.nonRetryable(
      "Required norms could not be processed",
      "IncompleteNormBatch",
      failedNorms,
    );
  }
  return {
    projectId: input.projectId,
    results: [...cached.results, ...childResults.filter((item) => item !== null)],
  };
}

interface CollectedSatz {
  absatzNr: string;
  satzNr: string;
  position: number;
  absatzKey: string;
  satzKey: string;
  satzIndex: number;
  tbmText: string;
}

export function deriveNorm(data: NormData): string {
  return `${data.gesetz} (${data.jurabk}) § ${data.paragraph || data.paragraphNr} ${data.paragraphTitel}`;
}

export function collectSuzSaetze(data: NormData): CollectedSatz[] {
  const result: CollectedSatz[] = [];
  let satzIndex = 0;
  for (const absatz of data.absaetze) {
    const absatzNr = String(absatz.absatzNr);
    for (let fallback = 0; fallback < absatz.saetze.length; fallback += 1) {
      const satz = absatz.saetze[fallback]!;
      const tatbestandsmerkmale = satz.tatbestandsmerkmale ?? [];
      if (tatbestandsmerkmale.length === 0) continue;
      const satzNr = String(satz.satzNr);
      const position = satz.position ?? fallback;
      result.push({
        absatzNr,
        satzNr,
        position,
        absatzKey: `absatz_${absatzNr}`,
        satzKey: `satz_${satzNr}_${position}`,
        satzIndex,
        tbmText: tatbestandsmerkmale.join(", "),
      });
      satzIndex += 1;
    }
  }
  return result;
}

export interface SuzOperations {
  workflowId: string;
  newId(): string;
  fetchNormData(input: { projectId: string; normId: string }): Promise<NormData>;
  fetchDocumentNodes(input: { projectId: string }): Promise<SuzDocuments>;
  fetchNormExaminationIds(input: {
    projectId: string;
    normId: string;
  }): Promise<NormExaminationIds>;
  runSatz(input: SatzChildInput, childId: string): Promise<SatzChildOutput>;
  insertResults(input: InsertSuzResultsInput): Promise<InsertSuzResultsOutput>;
}

export async function runSuzWorkflow(
  input: SuzWorkflowInput,
  operations: SuzOperations,
): Promise<SuzWorkflowOutput> {
  const ids = await operations.fetchNormExaminationIds({
    projectId: input.projectId,
    normId: input.normId,
  });
  const data =
    input.data ??
    (await operations.fetchNormData({
      projectId: input.projectId,
      normId: input.normId,
    }));
  const norm = deriveNorm(data);
  const saetze = collectSuzSaetze(data);
  if (saetze.length === 0) {
    const shouldHaveTbms = data.absaetze.some((absatz) =>
      absatz.saetze.some(
        (satz) => satz.normTypLvl1 === "materiell-rechtlich" && satz.normTypLvl2 === "wenn-dann",
      ),
    );
    if (shouldHaveTbms) {
      throw new Error(
        "No Saetze with tatbestandsmerkmale found, but eligible Sätze should have TBMs",
      );
    }
    return { norm, satzResults: [] };
  }
  const documents = await operations.fetchDocumentNodes({ projectId: input.projectId });
  const satzResults: SatzChildOutput[] = await boundedMap(
    saetze,
    NORM_LIMITS.satzChildren,
    async (satz) => {
      const satzId = ids.satzIdLookup[`${satz.absatzNr}:${satz.satzNr}:${satz.position}`];
      if (satzId === undefined) {
        throw new Error(
          `Satz ${satz.absatzNr}:${satz.satzNr} at position ${satz.position} not found for norm ${input.normId}`,
        );
      }
      const childInput: SatzChildInput = {
        norm,
        tbm: satz.tbmText,
        satzId: satzId,
        gesetzId: ids.gesetzId,
        normId: input.normId,
        data,
        projectId: input.projectId,
        normdetailId: input.normId,
        documentNodes: documents.documents,
        maxConcurrentPageindexSvm: NORM_LIMITS.pageIndex,
      };
      const result = await operations.runSatz(
        childInput,
        `${operations.workflowId}--${satz.absatzKey}-${satz.satzKey}-${satz.satzIndex}`,
      );
      return { ...result, satzId, normId: input.normId, gesetzId: ids.gesetzId };
    },
  );
  await operations.insertResults({
    projectId: input.projectId,
    satzOrchestratorOutputs: satzResults,
    resultId: operations.newId(),
    satzUpdatedAt: ids.satzUpdatedAt,
    sources: [...ids.sources, ...documents.sources],
  });
  return { norm, satzResults: satzResults };
}

export interface InsertRechtsmethodikOperations {
  newId(): string;
  fetchPlsTopicNorms(projectId: string): Promise<ExaminationTopicNorm[]>;
  fetchExaminationContext(projectId: string): Promise<ExaminationRechtsmethodikContext>;
  writeResult(input: {
    projectId: string;
    inserts: unknown[];
    updates: unknown[];
    gesetzId: string;
    normId: string;
  }): Promise<InsertRechtsmethodikResultOutput>;
  sleep(duration: string): Promise<void>;
}

export async function runInsertRechtsmethodikResultsWorkflow(
  input: InsertRechtsmethodikResultsInput,
  operations: InsertRechtsmethodikOperations,
): Promise<InsertRechtsmethodikResultOutput[]> {
  if (input.normResults.length === 0) return [];
  const topicNorms = await operations.fetchPlsTopicNorms(input.projectId);
  const results: InsertRechtsmethodikResultOutput[] = [];
  for (const normResult of input.normResults) {
    let result: InsertRechtsmethodikResultOutput | undefined;
    for (let attempt = 0; attempt < NORM_LIMITS.rechtsmethodikReconcileAttempts; attempt += 1) {
      const context = await operations.fetchExaminationContext(input.projectId);
      const plan = buildRechtsmethodikWritePlan([{ normResult, topicNorms }], context, () =>
        operations.newId(),
      );
      const materialized = plan.results[0];
      if (materialized === undefined) {
        throw new Error("Missing Rechtsmethodik write-plan result");
      }
      if (plan.inserts.length === 0 && plan.updates.length === 0) {
        result = {
          gesetzId: materialized.gesetzId,
          normId: materialized.normId,
          skipped: true,
          nodesInserted: 0,
        };
        break;
      }
      try {
        result = await operations.writeResult({
          projectId: input.projectId,
          inserts: plan.inserts,
          updates: plan.updates,
          gesetzId: materialized.gesetzId,
          normId: materialized.normId,
        });
        break;
      } catch (error) {
        if (attempt === NORM_LIMITS.rechtsmethodikReconcileAttempts - 1) {
          throw error;
        }
        await operations.sleep(NORM_LIMITS.rechtsmethodikReconcileDelay);
      }
    }
    if (result === undefined) {
      throw new Error("Rechtsmethodik insert did not produce a result");
    }
    results.push(result);
  }
  return results;
}

export interface InsertSuzOperations {
  newId(): string;
  fetchExistingDokumente(projectId: string): Promise<Record<string, string>>;
  resolveChunkDokumente(input: {
    projectId: string;
    chunkIds: string[];
  }): Promise<Record<string, string>>;
  writeSatzFundstellen(input: WriteSatzFundstellenInput): Promise<InsertSuzResultsOutput>;
}

export async function runInsertSuzResultsWorkflow(
  input: InsertSuzResultsInput,
  operations: InsertSuzOperations,
): Promise<InsertSuzResultsOutput> {
  const dmsToDokument = await operations.fetchExistingDokumente(input.projectId);
  if (input.satzOrchestratorOutputs.length === 0) {
    return { fundstellenInserted: 0, skipped: true, inserts: [] };
  }
  const results = await boundedMap(input.satzOrchestratorOutputs, NORM_LIMITS.resultInsertion, async (output) => {
    const chunkIds = [
      ...new Set(output.originaltexte.flatMap(({ chunkIds }) => chunkIds ?? []).filter(Boolean)),
    ].sort();
    const chunkToDokument = await operations.resolveChunkDokumente({
      projectId: input.projectId,
      chunkIds: chunkIds,
    });
    const inserts = mapFundstellen(output, chunkToDokument, dmsToDokument, () =>
      operations.newId(),
    );
    const satzUpdatedAt = input.satzUpdatedAt[output.satzId];
    if (satzUpdatedAt === undefined || inserts.length !== output.originaltexte.length) {
      throw ApplicationFailure.nonRetryable(
        "Search result could not be resolved completely",
        "IncompleteSearchResult",
      );
    }
    return operations.writeSatzFundstellen({
      projectId: input.projectId,
      resultId: input.resultId,
      satzId: output.satzId,
      satzUpdatedAt,
      sources: input.sources.filter(
        (source) => source.satzId === undefined || source.satzId === output.satzId,
      ),
      inserts,
    });
  });
  return {
    fundstellenInserted: results.reduce((total, result) => total + result.fundstellenInserted, 0),
    skipped: false,
    inserts: [],
  };
}
