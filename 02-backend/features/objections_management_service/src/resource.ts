import { defineResource } from "@spark-workflow/resource";
import type { NodeVersionService } from "@spark-workflow/node-crud";

import type {
  ArgumentExtractionBody,
  ArgumentExtractionResponse,
  ClassificationBody,
  ClassificationFailedBody,
  InjectionDetectedBody,
} from "./schemas.ts";

export type {
  ArgumentExtractionBody,
  ClassificationBody,
  ClassificationFailedBody,
  InjectionDetectedBody,
} from "./schemas.ts";

export interface UpdatedObjectionsCount {
  readonly updatedCount: number;
}

export interface ObjectionsService {
  listProcessedFileIds(projectId: string, projectVersion: number): Promise<string[]>;
  storeExtractionResults(
    projectId: string,
    projectVersion: number,
    body: ArgumentExtractionBody,
  ): Promise<ArgumentExtractionResponse>;
  storeClassificationResults(
    projectId: string,
    projectVersion: number,
    body: ClassificationBody,
  ): Promise<UpdatedObjectionsCount>;
  markClassificationFailed(
    projectId: string,
    projectVersion: number,
    body: ClassificationFailedBody,
  ): Promise<UpdatedObjectionsCount>;
  markInjectionDetected(
    projectId: string,
    projectVersion: number,
    body: InjectionDetectedBody,
  ): Promise<UpdatedObjectionsCount>;
}

export const Objections = defineResource<ObjectionsService>()("objections-management/Objections");

export const ObjectionsVersioning = defineResource<NodeVersionService>()(
  "objections-management/Versioning",
);
