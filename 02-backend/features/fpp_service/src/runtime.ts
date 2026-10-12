import { DocumentFiles } from "@spark-workflow/core/documents/resource";
import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { provide } from "@spark-workflow/resource";

import { fppSchema } from "./db/schema.ts";
import { confirmFppDownload, getFppFile } from "./files.ts";
import { FppFiles, type FppFilesService } from "./resource.ts";

export const fppFilesProvider = provide({
  resource: FppFiles,
  needs: { postgres: PostgreSQL, documents: DocumentFiles },
  make: ({ postgres, documents }) => {
    const scope = postgres.scope(fppSchema);
    return Object.freeze<FppFilesService>({
      getFile: (projectId, fileId) => getFppFile(scope, projectId, fileId),
      confirmDownload: (input) => confirmFppDownload(scope, documents, input),
    });
  },
});
