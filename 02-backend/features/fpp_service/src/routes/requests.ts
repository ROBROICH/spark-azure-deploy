import type { AuthPolicy } from "@spark-workflow/authentification";
import type { FeatureHttp } from "@spark-workflow/http-host";
import { Type, type TSchema } from "@sinclair/typebox";
import { better } from "better-drizzle";

import { fppSchema } from "../db/schema.ts";
import { fppErrors } from "../errors.ts";
import type { feature } from "../manifest.ts";
import {
  ConfirmDownloadInputSchema,
  FppConfirmDownloadResponseSchema,
  FppFileResponseSchema,
  FppRequestResponseSchema,
  IdParamsSchema,
} from "../schemas.ts";
import { parseFppXml } from "../xml.ts";

const servicePolicy = { roles: ["service"] } satisfies AuthPolicy;

export function createInternalRoutes(http: FeatureHttp<typeof feature>) {
  return http
    .controller("fpp-service.routes.internal")
    .get(
      "/internal/fpp/requests/:id",
      async ({ params, postgres }) => {
        const request = await postgres.query(async (transaction) =>
          better(transaction, { schema: fppSchema }).fppRequests.findUnique({
            where: { requestId: params.id },
            select: {
              requestId: true,
              internalProjectId: true,
              name: true,
              xml: true,
              projectId: true,
              status: true,
              createdAt: true,
              updatedAt: true,
              files: {
                select: {
                  id: true,
                  fileType: true,
                  fileUrl: true,
                  fileName: true,
                  createdAt: true,
                },
                orderBy: { id: "asc" },
              },
            },
          }),
        );
        if (request === null) {
          throw fppErrors.REQUEST_NOT_FOUND({
            message: `Request ${params.id} not found`,
            internal: { requestId: params.id },
          });
        }
        const xml = parseFppXml(request.xml);
        return {
          requestId: request.requestId,
          internalProjectId: request.internalProjectId,
          name: request.name,
          entryDate: xml.entryDate,
          xml: request.xml,
          state: xml.state,
          company: xml.company,
          addressCombined: xml.addressCombined,
          street: xml.street,
          houseNumber: xml.houseNumber,
          plz: xml.plz,
          location: xml.location,
          country: xml.country,
          email: xml.email,
          phone: xml.phone,
          fax: xml.fax,
          projectId: request.projectId,
          status: request.status,
          files: request.files,
          createdAt: request.createdAt,
          updatedAt: request.updatedAt,
        };
      },
      {
        params: IdParamsSchema,
        response: FppRequestResponseSchema as TSchema,
        auth: servicePolicy,
        detail: { operationId: "getFppRequest" },
      },
    )
    .get(
      "/internal/fpp/files/:id",
      async ({ params, postgres }) => {
        const request = await postgres.query(async (transaction) =>
          better(transaction, { schema: fppSchema }).fppRequests.findUnique({
            where: { requestId: params.id },
            select: {
              requestId: true,
              files: {
                select: {
                  id: true,
                  fileType: true,
                  fileUrl: true,
                  fileName: true,
                  createdAt: true,
                },
                orderBy: { id: "asc" },
              },
            },
          }),
        );
        if (request === null) {
          throw fppErrors.REQUEST_NOT_FOUND({
            message: `Request ${params.id} not found`,
            internal: { requestId: params.id },
          });
        }
        return request.files;
      },
      {
        params: IdParamsSchema,
        response: Type.Array(FppFileResponseSchema) as TSchema,
        auth: servicePolicy,
        detail: { operationId: "getFppRequestFiles" },
      },
    )
    .post(
      "/internal/fpp/files/:id/confirm-download",
      async ({ params, body, fppFiles }) => {
        await fppFiles.confirmDownload({ ...body, fileId: params.id });
        return { status: "confirmed", fileId: params.id, dmsFileId: body.dmsFileId };
      },
      {
        params: IdParamsSchema,
        body: ConfirmDownloadInputSchema,
        response: FppConfirmDownloadResponseSchema,
        auth: servicePolicy,
        fppFiles: true,
        detail: { operationId: "confirmFppFileDownload" },
      },
    );
}
