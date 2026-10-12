import type {
  ArgumentExtractionBody,
  ClassificationBody,
  ClassificationFailedBody,
  InjectionDetectedBody,
  ObjectionsService,
} from "@spark-workflow/objections-management-service/resource";
import { projectContexts } from "@spark-temporal/typescript/context";

import type { ExtractionStoreResponse } from "./temporal/assessment-contracts.ts";

export interface AosObjectionsUpdateResult {
  readonly updatedCount: number;
}

export interface AosObjectionsService {
  listProcessedFileIds(projectId: string): Promise<string[]>;
  storeExtractionResults(
    projectId: string,
    body: ArgumentExtractionBody,
  ): Promise<ExtractionStoreResponse>;
  storeClassificationResults(
    projectId: string,
    body: ClassificationBody,
  ): Promise<AosObjectionsUpdateResult>;
  markClassificationFailed(
    projectId: string,
    body: ClassificationFailedBody,
  ): Promise<AosObjectionsUpdateResult>;
  markInjectionDetected(
    projectId: string,
    body: InjectionDetectedBody,
  ): Promise<AosObjectionsUpdateResult>;
}

export class ObjectionsProjectContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectionsProjectContextError";
  }
}

function projectVersion(projectId: string): number {
  const context = projectContexts.getStore();
  if (context === undefined) {
    throw new ObjectionsProjectContextError("Objections operations require project context");
  }
  if (context.projectId !== projectId) {
    throw new ObjectionsProjectContextError(
      `Objections project ${projectId} does not match context project ${context.projectId}`,
    );
  }
  return context.projectVersion;
}

export function createAosObjectionsService(
  objections: ObjectionsService,
): AosObjectionsService {
  const service: AosObjectionsService = {
    async listProcessedFileIds(projectId) {
      return [...(await objections.listProcessedFileIds(projectId, projectVersion(projectId)))];
    },
    async storeExtractionResults(projectId, body) {
      const stored = await objections.storeExtractionResults(
        projectId,
        projectVersion(projectId),
        body,
      );
      return {
        results: stored.results.map((result) => ({
          documentId: result.documentId,
          beteiligungsEingangId: result.beteiligungsEingangId,
          arguments: result.arguments.map(({ argumentId, extractedArgument }) => ({
            argumentId,
            extractedArgument,
          })),
          skipped: result.skipped,
        })),
      };
    },
    async storeClassificationResults(projectId, body) {
      const result = await objections.storeClassificationResults(
        projectId,
        projectVersion(projectId),
        body,
      );
      return { updatedCount: result.updatedCount };
    },
    async markClassificationFailed(projectId, body) {
      const result = await objections.markClassificationFailed(
        projectId,
        projectVersion(projectId),
        body,
      );
      return { updatedCount: result.updatedCount };
    },
    async markInjectionDetected(projectId, body) {
      const result = await objections.markInjectionDetected(
        projectId,
        projectVersion(projectId),
        body,
      );
      return { updatedCount: result.updatedCount };
    },
  };
  return Object.freeze(service);
}
