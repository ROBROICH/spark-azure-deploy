import type {
  ExaminationTopicNorm,
  RechtsmethodikWorkflowOutput as RechtsmethodikResult,
  SucheZuordnungNormData as NormData,
} from "@spark-temporal/contracts";

import type {BatchInsertExtractionInput, BatchInsertExtractionOutput, FileObject, ProcessedFileInfo, TemplateDocumentType, Topic, } from "../schemas.ts";
import type {CachedNormBatchInput, CachedNormBatchOutput, ExaminationRechtsmethodikContext, InsertRechtsmethodikResultOutput, InsertSuzResultsOutput, NormExaminationIds, NormRef, RechtsmethodikChildInput, ResolveChunkDokumenteInput, SuzDocuments, WriteRechtsmethodikResultInput, WriteSatzFundstellenInput, } from "./norm-contracts.ts";
import type {AssessmentActivities} from "./assessment-activities.ts";
import type { FvpActivityResult } from "./workflow-contracts.ts";

export interface CoreAosActivities {
  downloadFppFile(input: {
    projectId: string;
    url: string;
    fileName: string;
    fileId: string;
    fileType: string;
  }): Promise<FileObject | null>;
  sendFvpResults(input: {
    projectId: string;
    fileId: string;
  }): Promise<unknown>;
  sendPlausibilityResults(input: {
    projectId: string;
    fileId: string;
  }): Promise<unknown>;
  fetchExistingDokumentNodes(
    projectId: string,
  ): Promise<unknown[]>;
  getFormalCompletenessResults(
    projectId: string,
  ): Promise<unknown>;
  getProjectFiles(projectId: string): Promise<FileObject[]>;
  listFvpProjectFiles(projectId: string): Promise<FvpActivityResult<FileObject[]>>;
  getTemplateDocumentTypes(
    projectId: string,
  ): Promise<TemplateDocumentType[]>;
  sendTocMatchingResults(input: {
    projectId: string;
    fileId: string;
  }): Promise<unknown>;
  markTocDocument(
    projectId: string,
    dmsFileId: string,
  ): Promise<unknown>;
  batchInsertExtractionNodes(
    input: BatchInsertExtractionInput,
  ): Promise<BatchInsertExtractionOutput>;
  getTopics(projectId: string): Promise<Topic[]>;
  updateFileTopics(fileId: string, topicIds: string[]): Promise<FileObject>;
  fetch_processed_documents_from_graph(
    projectId: string,
  ): Promise<ProcessedFileInfo[]>;
  fetchExaminationRechtsmethodikContext(
    projectId: string,
  ): Promise<ExaminationRechtsmethodikContext>;
  fetchPlsTopicNorms(projectId: string): Promise<ExaminationTopicNorm[]>;
  insertRechtsmethodikResult(
    input: WriteRechtsmethodikResultInput,
  ): Promise<InsertRechtsmethodikResultOutput>;
  getNormDeconstruction(input: RechtsmethodikChildInput): Promise<RechtsmethodikResult | null>;
  saveNormDeconstruction(input: {
    jurabk: string;
    paragraphNr: string;
    deconstruction: RechtsmethodikResult;
  }): Promise<void>;
  fetchProjectNorms(projectId: string): Promise<NormRef[]>;
  processCachedNormDeconstructions(input: CachedNormBatchInput): Promise<CachedNormBatchOutput>;
  fetchDocumentNodes(input: {
    projectId: string;
  }): Promise<SuzDocuments>;
  fetchNormData(input: { projectId: string; normId: string }): Promise<NormData>;
  fetchNormExaminationIds(input: {
    projectId: string;
    normId: string;
  }): Promise<NormExaminationIds>;
  fetchExistingDokumenteForSuz(projectId: string): Promise<Record<string, string>>;
  resolveChunkDokumente(input: ResolveChunkDokumenteInput): Promise<Record<string, string>>;
  writeSatzFundstellen(input: WriteSatzFundstellenInput): Promise<InsertSuzResultsOutput>;
}

export type AosActivities = CoreAosActivities & AssessmentActivities;
