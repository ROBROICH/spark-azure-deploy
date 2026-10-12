import { defineResource } from "@spark-workflow/resource";
import type { Result } from "better-result";

export interface FppDownloadRequest {
  readonly projectId: string;
  readonly file: {
    readonly url: string;
    readonly fileName: string;
    readonly fileId: string;
    readonly fileType: string;
  };
}

export interface FppDownloadResult {
  readonly parentJobId: string;
}

export interface FppDownloadsService {
  start(input: FppDownloadRequest): Promise<Result<FppDownloadResult, Error>>;
}

export const FppDownloads = defineResource<FppDownloadsService>()(
  "agent-orchestration/FppDownloads",
);

export interface FppFile {
  readonly id: string;
  readonly projectId: string;
  readonly projectVersion: number;
  readonly fileUrl: string;
  readonly fileName: string | null;
  readonly fileType: string;
  readonly dmsFileId: string | null;
  readonly downloaded: boolean;
}

export interface FppFilesService {
  getFile(projectId: string, fileId: string): Promise<FppFile>;
  confirmDownload(input: {
    readonly projectId: string;
    readonly projectVersion: number;
    readonly fileId: string;
    readonly dmsFileId: string;
  }): Promise<void>;
}

export const FppFiles = defineResource<FppFilesService>()("fpp/Files");
