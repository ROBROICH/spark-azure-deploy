import type { AuthPolicy } from "@spark-workflow/authentification";
import { recordAuditEntry } from "@spark-workflow/audit-client/persistence";
import type { ProjectsResourceService } from "@spark-workflow/core/projects/resource";
import type { FeatureHttp } from "@spark-workflow/http-host";
import type { PostgresScope } from "@spark-workflow/postgres-runtime";
import { Type } from "@sinclair/typebox";
import { better } from "better-drizzle";

import { afdSchema } from "../db/schema.ts";
import { generateDocx } from "../document/docx";
import { UnoConverter, type UnoTarget } from "../document/uno";
import { administrativeFileDraftErrors } from "../errors";
import type { feature } from "../manifest.ts";
import { UuidSchema } from "../schemas";

const exportPolicy = {
  permissions: [{ resource: "project", permission: "export", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;
const params = Type.Object({ projectId: UuidSchema }, { additionalProperties: false });

const createUnoConverter = (configuration: {
  readonly host: string;
  readonly port: number;
  readonly protocol: "http" | "https";
  readonly timeoutMilliseconds: number;
  readonly preflightTimeoutMilliseconds: number;
}) =>
  new UnoConverter(
    configuration.host,
    configuration.port,
    configuration.protocol,
    configuration.timeoutMilliseconds,
    configuration.preflightTimeoutMilliseconds,
  );

async function exportDocument(
  postgres: PostgresScope<typeof afdSchema>,
  projects: Pick<ProjectsResourceService, "exportMetadata">,
  converter: UnoConverter,
  projectId: string,
  target: UnoTarget,
) {
  const exported = await projects.exportMetadata(projectId);
  if (exported.isErr()) throw exported.error;
  const metadata = exported.value;
  const nodes = await postgres.query(async (query) =>
    better(query, { schema: afdSchema }).vaeNodes.findMany({
      select: {
        id: true,
        parentVaeNodeId: true,
        title: true,
        text: true,
        order: true,
        isHidden: true,
        isDeleted: true,
      },
      where: {
        projectId,
        projectVersion: metadata.latestVersion,
        isDeleted: false,
        isHidden: false,
      },
      orderBy: [{ order: "asc" }, { id: "asc" }],
    }),
  );
  if (nodes.length === 0) {
    throw administrativeFileDraftErrors.EXPORT_NOT_FOUND({ internal: { projectId } });
  }
  const generated = await generateDocx(nodes, metadata.name, metadata.internalProjectNumber);
  const converted = await converter.convert(generated, target).catch((error) => {
    if (error instanceof Error) {
      throw administrativeFileDraftErrors.DOCUMENT_CONVERSION_FAILED({
        cause: error,
        internal: { projectId, target, failure: String(error) },
      });
    }
    throw administrativeFileDraftErrors.DOCUMENT_CONVERSION_FAILED({
      internal: { projectId, target, failure: String(error) },
    });
  });
  await postgres.query((query) =>
    recordAuditEntry(query, {
      projectId,
      entityType: "project",
      entityId: projectId,
      changeType: "action",
      actionType: `administrative_file_draft_export_${target}`,
    }),
  );
  return converted;
}

const documentResponse = (bytes: Uint8Array, projectId: string, format: UnoTarget) =>
  new Response(Uint8Array.from(bytes), {
    headers: {
      "content-type":
        format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : "application/pdf",
      "content-disposition": `attachment; filename=beschluss_${projectId}.${format}`,
    },
  });

export const createExportRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("administrative-file-draft.routes.exports")
    .post(
      "/:projectId/export/docx",
      async ({ params, postgres, projects, configuration }) => {
        const converter = createUnoConverter(configuration.uno);
        return documentResponse(
          await exportDocument(postgres, projects, converter, params.projectId, "docx"),
          params.projectId,
          "docx",
        );
      },
      {
        params,
        response: Type.String({ format: "binary" }),
        auth: exportPolicy,
        projects: true,
        configuration: true,
        detail: { operationId: "exportAdministrativeFileDraftDocx" },
      },
    )
    .post(
      "/:projectId/export/pdf",
      async ({ params, postgres, projects, configuration }) => {
        const converter = createUnoConverter(configuration.uno);
        return documentResponse(
          await exportDocument(postgres, projects, converter, params.projectId, "pdf"),
          params.projectId,
          "pdf",
        );
      },
      {
        params,
        response: Type.String({ format: "binary" }),
        auth: exportPolicy,
        projects: true,
        configuration: true,
        detail: { operationId: "exportAdministrativeFileDraftPdf" },
      },
    );
