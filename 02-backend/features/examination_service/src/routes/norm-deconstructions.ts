import type { AuthPolicy } from "@spark-workflow/authentification";
import type { FeatureHttp } from "@spark-workflow/http-host";
import { Type } from "@sinclair/typebox";
import { better } from "better-drizzle";

import {
  NormDeconstructionInputSchema,
  NormDeconstructionQuerySchema,
  NormDeconstructionResponseSchema,
} from "../contracts.ts";
import { examinationSchema } from "../db/schema.ts";
import type { feature } from "../manifest.ts";

const servicePolicy = { roles: ["service"] } satisfies AuthPolicy;
export const createNormDeconstructionRoutes = (http: FeatureHttp<typeof feature>) =>
  http
    .controller("examination-service.routes.norm-deconstructions")
    .get(
      "/norm-deconstructions/",
      async ({ query, set, postgres }) => {
        const page = await postgres.query((database) =>
          better(database, { schema: examinationSchema }).normDeconstruction.paginate({
            where: { jurabk: query.jurabk, paragraph: query.paragraph },
            select: {
              id: true,
              jurabk: true,
              paragraph: true,
              deconstruction: true,
              createdAt: true,
            },
            orderBy: [{ jurabk: "asc" }, { paragraph: "asc" }],
            limit: query.limit,
            skip: query.offset,
          }),
        );
        const nextOffset = query.offset + page.data.length;
        const hasMore = nextOffset < page.pagination.count;
        set.headers["X-Total-Count"] = String(page.pagination.count);
        set.headers["X-Returned-Count"] = String(page.data.length);
        set.headers["X-Offset"] = String(query.offset);
        set.headers["X-Limit"] = String(query.limit);
        set.headers["X-Has-More"] = String(hasMore);
        if (hasMore) set.headers["X-Next-Offset"] = String(nextOffset);
        return page.data;
      },
      {
        query: NormDeconstructionQuerySchema,
        response: Type.Array(NormDeconstructionResponseSchema),
        auth: servicePolicy,
        detail: { operationId: "getNormDeconstructions" },
      },
    )
    .post(
      "/norm-deconstructions/",
      ({ body, examination }) => examination.saveNormDeconstructions(body),
      {
        body: Type.Array(NormDeconstructionInputSchema, { maxItems: 1_000 }),
        response: Type.Array(NormDeconstructionResponseSchema),
        auth: servicePolicy,
        examination: true,
        detail: { operationId: "upsertNormDeconstructions" },
      },
    );
