import { auditLogs } from "@spark-workflow/audit-client/schema";
import { Projects } from "@spark-workflow/core/projects/resource";
import {
  ProjectNodes,
  projectNodesProvider,
  projectsProvider,
  usecasesProvider,
} from "@spark-workflow/core/projects/runtime";
import { projectHistory, projectLogicSchema, projects } from "@spark-workflow/core/projects/schema";
import { createFeatureHttp, createHttpHost } from "@spark-workflow/http-host";
import { createPostgresRuntime, PostgreSQL } from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provideValue } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import { inArray } from "drizzle-orm";
import { Buffer } from "node:buffer";

import { afdSchema, risks, risksHistory, vaeNodeHistory, vaeNodes } from "../../src/db/schema.ts";
import {
  AdministrativeFileDraftConfiguration,
  parseAdministrativeFileDraftConfiguration,
} from "../../src/env.ts";
import { createRoutes, feature } from "../../src/index.ts";
import { AdministrativeFileDraftNodes } from "../../src/node/descriptor.ts";

process.env.AUTH_MODE = "disabled";

export const databaseUrl = process.env.ADMINISTRATIVE_FILE_DRAFT_DATABASE_URL;
const schema = { ...projectLogicSchema, ...afdSchema, auditLogs };

export async function createPostgresApp(url: string) {
  await using setup = new AsyncDisposableStack();
  const uno = setup.adopt(Bun.serve({
    port: 0,
    async fetch(request) {
      const body = await request.text();
      const value = body.includes("<methodName>info</methodName>")
        ? "<struct><member><name>api</name><value><string>3</string></value></member></struct>"
        : `<base64>${Buffer.from("converted").toString("base64")}</base64>`;
      return new Response(
        `<?xml version="1.0"?><methodResponse><params><param><value>${value}</value></param></params></methodResponse>`,
        { headers: { "content-type": "text/xml" } },
      );
    },
  }), (server) => server.stop(true));
  const database = setup.adopt(createPostgresRuntime({
    url,
    schema,
    pool: {
      maxConnections: 4,
      idleTimeoutSeconds: 5,
      connectionTimeoutSeconds: 5,
      maxLifetimeSeconds: 60,
      closeTimeoutSeconds: 5,
    },
  }), (database) => database.close());
  await database.ready();
  const resources = setup.adopt(makeEffectResourceRuntime(
    composeFeatures([
      feature,
      defineFeature({
        id: "administrative-file-draft-postgres-platform",
        needs: {},
        providers: [
          provideValue(PostgreSQL, database),
          projectNodesProvider,
          projectsProvider,
          usecasesProvider,
          provideValue(
            AdministrativeFileDraftConfiguration,
            parseAdministrativeFileDraftConfiguration({
              UNO_HOST: "127.0.0.1",
              UNO_PORT: String(uno.port),
              UNO_PROTOCOL: "http",
              UNO_TIMEOUT_MS: "1000",
              UNO_PREFLIGHT_TIMEOUT_MS: "1000",
            }),
          ),
        ] as const,
        tables: {},
      }),
    ] as const),
  ), (resources) => resources.close());
  const app = createHttpHost("administrative-file-draft-postgres-test").use(
    createRoutes(createFeatureHttp(resources).for(feature)),
  );
  const nodes = await resources.get(AdministrativeFileDraftNodes);
  const projectNodes = await resources.get(ProjectNodes);
  const projectsService = await resources.get(Projects);
  const lifetime = setup.move();
  return {
    database,
    app,
    nodes,
    projectNodes,
    projects: projectsService,
    async close(projectIds: readonly string[]) {
      await using _resources = lifetime;
      const ids = [...projectIds];
      await database.query(async (query) => {
        for (const column of [
          risks.projectId, vaeNodes.projectId, risksHistory.projectId, vaeNodeHistory.projectId,
          auditLogs.projectId, projects.id, projectHistory.id,
        ]) {
          await query.delete(column.table).where(inArray(column, ids));
        }
      });
    },
  };
}
