import type { AuthPolicy } from "@spark-workflow/authentification";
import type { ProjectsResourceService } from "@spark-workflow/core/projects/resource";
import { isoInstant, type FeatureHttp } from "@spark-workflow/http-host";
import type { PostgresQueryClient } from "@spark-workflow/postgres-runtime";
import { better } from "better-drizzle";
import { status } from "elysia";

import { fppFiles, fppRequests, fppSchema } from "../db/schema.ts";
import { fppErrors } from "../errors.ts";
import type { feature } from "../manifest.ts";
import {
  type FppProjectInput,
  FppProjectInputSchema,
  FppProjectResponseSchema,
} from "../schemas.ts";
import { validateFileUrl } from "../url.ts";
import { parseFppXml } from "../xml.ts";

type ProjectCreator = Pick<ProjectsResourceService, "createProject">;
type CreateProjectRequest = Parameters<ProjectCreator["createProject"]>[0];
type ImportFile = Pick<typeof fppFiles.$inferSelect, "fileType" | "fileUrl" | "fileName">;
type StoredImport = Pick<
  typeof fppRequests.$inferSelect,
  "requestId" | "internalProjectId" | "name" | "xml"
> & { readonly files: readonly ImportFile[] };

const servicePolicy = { roles: ["service"] } satisfies AuthPolicy;

const fppDatabase = (database: PostgresQueryClient<typeof fppSchema>) =>
  better(database, { schema: fppSchema });

const fileSet = (files: readonly ImportFile[]) =>
  JSON.stringify(
    files
      .map(({ fileType, fileUrl, fileName }) => JSON.stringify([fileType, fileUrl, fileName]))
      .sort(),
  );

function sameImport(stored: StoredImport, body: FppProjectInput): boolean {
  return (
    stored.requestId === body.requestId &&
    stored.internalProjectId === body.internalProjectId &&
    stored.name === body.name &&
    stored.xml === body.xml &&
    fileSet(stored.files) ===
      fileSet((body.files ?? []).map((file) => ({ ...file, fileName: file.fileName ?? null })))
  );
}

export function createProjectRoutes(http: FeatureHttp<typeof feature>) {
  return http.controller("fpp-service.routes.projects").post(
    "/external/fpp/projects",
    async ({ body, postgres, projects, configuration, fppDownloads }) => {
      for (const file of body.files ?? []) {
        validateFileUrl(file.fileUrl, configuration.downloadPolicy);
      }
      const internal = { requestId: body.requestId };
      const findImports = () =>
        postgres.query((database) =>
          fppDatabase(database).fppRequests.findMany({
            where: {
              OR: [{ requestId: body.requestId }, { internalProjectId: body.internalProjectId }],
            },
            include: { files: true },
          }),
        );

      const matches = await findImports();
      let request = matches[0];
      if (matches.length > 1 || (request !== undefined && !sameImport(request, body))) {
        throw fppErrors.IMPORT_CONFLICT({ internal });
      }
      if (request !== undefined && request.status !== "IMPORTED" && request.status !== "FAILED") {
        throw fppErrors.IMPORT_CONFLICT({ internal });
      }

      if (request?.status !== "IMPORTED") {
        let xml: ReturnType<typeof parseFppXml>;
        try {
          xml = parseFppXml(body.xml);
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "Invalid XML failed to parse";
          if (cause instanceof Error) {
            throw fppErrors.INVALID_XML({ message: `Invalid XML data: ${message}`, cause });
          }
          throw fppErrors.INVALID_XML({ message: `Invalid XML data: ${message}` });
        }
        const fileRows = (body.files ?? []).map((file) => ({
          id: crypto.randomUUID(),
          requestId: body.requestId,
          fileType: file.fileType,
          fileUrl: file.fileUrl,
          fileName: file.fileName ?? null,
        }));
        const projectBody: CreateProjectRequest = {
          name: body.name,
          projectTypeId: configuration.defaultProjectTypeId,
          imported: true,
          createdById: configuration.systemUserId,
          entryDate: xml.entryDate,
          internalProjectNumber: body.internalProjectId,
          state: xml.primaryState ?? undefined,
          company: xml.company ?? undefined,
          street: xml.street ?? undefined,
          houseNumber: xml.houseNumber ?? undefined,
          plz: xml.plz ?? undefined,
          location: xml.location ?? undefined,
          country: xml.country ?? undefined,
          email: xml.email ?? undefined,
          phone: xml.phone ?? undefined,
          fax: xml.fax ?? undefined,
        };
        const failed = request;
        const creation = await projects.createProject(projectBody, (project) =>
          postgres.query(async (transaction) => {
            const database = fppDatabase(transaction);
            if (failed === undefined) {
              await database.fppRequests.create({
                data: {
                  requestId: body.requestId,
                  internalProjectId: body.internalProjectId,
                  name: body.name,
                  xml: body.xml,
                  status: "IMPORTED",
                  projectId: project.id,
                },
              });
              if (fileRows.length > 0) {
                await database.fppFiles.createMany({
                  data: fileRows.map((file) => ({
                    ...file,
                    projectVersion: project.projectVersion,
                  })),
                });
              }
              return;
            }
            const recovered = await database.fppRequests.update({
              where: { requestId: body.requestId, status: "FAILED", projectId: null },
              data: { status: "IMPORTED", projectId: project.id, updatedAt: new Date() },
            });
            if (recovered === null) throw fppErrors.IMPORT_CONFLICT({ internal });
            await database.fppFiles.updateMany({
              where: { requestId: body.requestId },
              data: { projectVersion: project.projectVersion, updatedAt: new Date() },
            });
          }),
        );
        if (creation.isErr() && failed === undefined) {
          await postgres.transact(() =>
            postgres.query(async (transaction) => {
              const inserted = await transaction
                .insert(fppRequests)
                .values({
                  requestId: body.requestId,
                  internalProjectId: body.internalProjectId,
                  name: body.name,
                  xml: body.xml,
                  status: "FAILED",
                  projectId: null,
                })
                .onConflictDoNothing()
                .returning({ requestId: fppRequests.requestId });
              if (inserted.length > 0 && fileRows.length > 0) {
                await transaction.insert(fppFiles).values(fileRows);
              }
            }),
          );
        }
        [request] = await findImports();
        if (request?.status !== "IMPORTED") {
          throw fppErrors.PROJECT_CREATION_FAILED({
            cause: creation.isErr() ? creation.error : undefined,
          });
        }
        if (!sameImport(request, body)) throw fppErrors.IMPORT_CONFLICT({ internal });
      }

      const { projectId } = request;
      if (projectId === null) throw fppErrors.PROJECT_CREATION_FAILED();
      const plans = request.files.filter(({ fileType }) => fileType === "PLANUNTERLAGEN");
      if (plans.length > 1) throw fppErrors.ARCHIVE_SET_UNSUPPORTED({ internal });
      for (const file of plans) {
        if (file.downloaded) continue;
        const dispatched = await fppDownloads.start({
          projectId,
          file: {
            url: file.fileUrl,
            fileName: file.fileName ?? "planunterlagen.zip",
            fileId: file.id,
            fileType: file.fileType,
          },
        });
        if (dispatched.isErr()) {
          throw fppErrors.DOWNLOAD_FAILED({ cause: dispatched.error, internal });
        }
      }
      return status(201, {
        requestId: request.requestId,
        internalProjectId: request.internalProjectId,
        name: request.name,
        status: request.status,
        createdAt: isoInstant(request.createdAt),
        updatedAt: isoInstant(request.updatedAt),
      });
    },
    {
      body: FppProjectInputSchema,
      response: { 201: FppProjectResponseSchema },
      auth: servicePolicy,
      projects: true,
      configuration: true,
      fppDownloads: true,
      detail: { operationId: "createFppProject" },
    },
  );
}
