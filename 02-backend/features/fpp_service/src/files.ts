import type { DocumentFilesService } from "@spark-workflow/core/documents/resource";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { better } from "better-drizzle";

import { fppSchema } from "./db/schema.ts";
import { fppErrors } from "./errors.ts";
import type { FppFile } from "./resource.ts";

export async function getFppFile(
  scope: PostgresScope<typeof fppSchema>,
  projectId: string,
  fileId: string,
): Promise<FppFile> {
  const file = await scope.query((database) =>
    better(database, { schema: fppSchema }).fppFiles.findFirst({
      where: { id: fileId, request: { is: { projectId } } },
      select: {
        id: true,
        projectVersion: true,
        fileUrl: true,
        fileName: true,
        fileType: true,
        dmsFileId: true,
        downloaded: true,
      },
    }),
  );
  if (file === null) throw fppErrors.FILE_NOT_FOUND({ internal: { projectId, fileId } });
  if (file.projectVersion === null) {
    throw fppErrors.FILE_VERSION_UNKNOWN({ internal: { projectId, fileId } });
  }
  return { ...file, projectId, projectVersion: file.projectVersion };
}

export async function confirmFppDownload(
  scope: PostgresScope<typeof fppSchema>,
  documents: Pick<DocumentFilesService, "getZipFile">,
  input: { projectId: string; projectVersion: number; fileId: string; dmsFileId: string },
): Promise<void> {
  const source = await getFppFile(scope, input.projectId, input.fileId);
  const receipt = await documents.getZipFile(input.dmsFileId, input.projectVersion);
  if (
    source.projectVersion !== input.projectVersion ||
    receipt.id !== input.dmsFileId ||
    receipt.projectId !== input.projectId ||
    receipt.type !== "zip"
  ) {
    throw fppErrors.DOWNLOAD_CONFLICT({ internal: input });
  }
  const file = await scope.query((database) =>
    better(database, { schema: fppSchema }).fppFiles.update({
      where: {
        id: input.fileId,
        projectVersion: input.projectVersion,
        request: { is: { projectId: input.projectId } },
        OR: [{ dmsFileId: null }, { dmsFileId: input.dmsFileId }],
      },
      data: { downloaded: true, dmsFileId: input.dmsFileId, updatedAt: new Date() },
      select: { id: true },
    }),
  );
  if (file === null) throw fppErrors.DOWNLOAD_CONFLICT({ internal: input });
}
