import type { NodeVersionService } from "@spark-workflow/node-crud";
import type { ProjectLogicVersioningService } from "../resource.ts";

import type {
  ApprovalStatusResponse,
  CommitDiffResponse,
  DmsApprovalStatus,
  ServiceName,
  TemplateTopic,
} from "./contracts.ts";
import type { FileDiffSummary } from "@spark-temporal/contracts";

export interface FormalCompletenessVersioningService extends NodeVersionService {
  initializeRequiredDocumentTypes(
    projectId: string,
    projectTypeId: string,
    projectVersion: number,
  ): Promise<void>;
}

export interface AdministrativeFileDraftVersioningService extends NodeVersionService {
  assignTemplate(
    projectId: string,
    projectTypeId: string,
    topics: readonly TemplateTopic[],
    projectVersion: number,
  ): Promise<void>;
}

export interface DocumentManagementVersioningService extends NodeVersionService {
  getZipDiff(projectId: string, zipFileId: string, sourceVersion: number): Promise<FileDiffSummary>;
  updateZipApprovalStatus(
    projectId: string,
    zipFileId: string,
    approvalStatus: DmsApprovalStatus,
    error: string | null,
  ): Promise<ApprovalStatusResponse>;
  commitZipDiff(input: {
    readonly projectId: string;
    readonly zipFileId: string;
    readonly sourceVersion: number;
    readonly targetVersion: number;
    readonly lockToken: string;
    readonly dryRun: boolean;
  }): Promise<CommitDiffResponse>;
}

export interface ProjectLogicWorkerServices {
  readonly nodes: Readonly<Record<ServiceName, NodeVersionService>> & {
    readonly projectLogicService: ProjectLogicVersioningService;
  };
  readonly documentManagement: DocumentManagementVersioningService;
  readonly formalCompleteness: FormalCompletenessVersioningService;
  readonly administrativeFileDraft: AdministrativeFileDraftVersioningService;
}
