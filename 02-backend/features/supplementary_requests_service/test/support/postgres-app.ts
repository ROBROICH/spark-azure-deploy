import {
  DocumentCommandConfiguration,
  DocumentConfiguration,
  documentFilesProvider,
  documentRuntimeProvider,
  documentTemporalCommandsProvider,
  parseDocumentCommandConfiguration,
  parseDocumentConfiguration,
} from "@spark-workflow/core/documents";
import { projectNodesProvider, projectsProvider } from "@spark-workflow/core/projects/runtime";
import { coreSchema } from "@spark-workflow/core/schema";
import { createFeatureHttp, createHttpHost } from "@spark-workflow/http-host";
import { createPostgresRuntime, PostgreSQL } from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provideValue } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";

import { supplementaryRequestsDatabaseSchema } from "../../src/db/schema.ts";
import { createRoutes, createV2Routes, feature } from "../../src/index.ts";

export const databaseUrl = process.env.SUPPLEMENTARY_REQUESTS_MUTATION_DATABASE_URL;

export async function createPostgresApp(url: string) {
  const database = createPostgresRuntime({
    url,
    schema: { ...coreSchema, ...supplementaryRequestsDatabaseSchema },
    pool: {
      maxConnections: 4,
      idleTimeoutSeconds: 5,
      connectionTimeoutSeconds: 5,
      maxLifetimeSeconds: 60,
      closeTimeoutSeconds: 5,
    },
  });
  await database.ready();
  const resources = makeEffectResourceRuntime(
    composeFeatures([
      feature,
      defineFeature({
        id: "supplementary-requests-postgres-platform",
        needs: {},
        providers: [
          provideValue(PostgreSQL, database),
          projectNodesProvider,
          projectsProvider,
          documentTemporalCommandsProvider,
          documentRuntimeProvider,
          documentFilesProvider,
          provideValue(
            DocumentConfiguration,
            parseDocumentConfiguration({
              ENV: "local",
              BUCKET_NAME: "unused",
              S3_ACCESS_KEY_ID: "unused",
              S3_SECRET_ACCESS_KEY: "unused",
              S3_ENDPOINT_URL: "http://storage.invalid:9000",
              S3_EXTERNAL_URL: "http://storage.invalid:9000",
              S3_REGION: "eu-west-1",
              CLAMAV_ENABLED: "false",
              CLAMAV_BASE_URL: "http://127.0.0.1:1",
              MAX_OBJECT_SIZE_MB: "1",
            }),
          ),
          provideValue(
            DocumentCommandConfiguration,
            parseDocumentCommandConfiguration({
              TEMPORAL_HOST: "127.0.0.1:1",
              TEMPORAL_NAMESPACE: "unused",
            }),
          ),
        ] as const,
        tables: {},
      }),
    ] as const),
  );
  const http = createFeatureHttp(resources).for(feature);
  return {
    database,
    app: createHttpHost("supplementary-requests-postgres-test")
      .use(createRoutes(http))
      .group("/api/v2/supplementary-requests", (group) => group.use(createV2Routes(http))),
    async close() {
      await resources.close();
      await database.close();
    },
  };
}
