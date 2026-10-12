import { SQL } from "bun";
import { projectNodesProvider, projectsProvider } from "@spark-workflow/core/projects/runtime";
import { projectLogicSchema, projects, topics } from "@spark-workflow/core/projects/schema";
import { createFeatureHttp, createHttpHost } from "@spark-workflow/http-host";
import {
  createPostgresRuntime,
  PostgreSQL,
  type PostgresResourceRuntime,
} from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provideValue } from "@spark-workflow/resource";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import type { RechtsmethodikWorkflowOutput } from "@spark-temporal/contracts";
import type { Elysia } from "elysia";

import { examinationSchema } from "../../src/db/schema.ts";
import { ExaminationConfiguration } from "../../src/env.ts";
import { feature } from "../../src/manifest.ts";
import { createLegalBasisRoutes } from "../../src/routes/legal-basis.ts";

export const databaseUrl = process.env.EXAMINATION_TEST_DATABASE_URL;
const legalBasisSchema = { ...projectLogicSchema, ...examinationSchema };

export interface LawNormPayload {
  jurabk: string;
  paragraph_nr: string;
  titel: string;
  paragraph_text: string;
  doknr: string;
  bundesland: null;
  dokument_typ: string;
  prev: null;
  next: null;
}

export interface LegalBasisFixture {
  app: Pick<Elysia, "handle">;
  client: SQL;
  postgres: PostgresResourceRuntime<typeof legalBasisSchema>;
  lawRequests: URL[];
  cacheLaws: string[];
  createProject(): Promise<{ projectId: string; topicId: string }>;
  graphSnapshot(projectId: string): Promise<string[][]>;
  close(): Promise<void>;
}

export function cachedNorm(jurabk: string, paragraphNr: string): RechtsmethodikWorkflowOutput {
  return {
    gesetz: "Regression law",
    jurabk,
    paragraphNr,
    paragraphTitel: "Protection",
    paragraphText: "Protected text from the canonical cache.",
    standangaben: [{ standtyp: "Stand", standkommentar: "Published 2026-09-22" }],
    absaetze: [
      {
        absatzNr: "1",
        absatzText: "Protection requirements",
        saetze: [
          {
            id: crypto.randomUUID(),
            satzNr: "1",
            markers: ["Nr. 1"],
            satzText: "A protected species must be preserved.",
            normTypLvl1: "materiell-rechtlich",
          },
        ],
      },
    ],
  };
}

export function lawNorm(jurabk: string, paragraph: string): LawNormPayload {
  return {
    jurabk,
    paragraph_nr: paragraph,
    titel: "Protection",
    paragraph_text: "Current text from Law DB.",
    doknr: `${jurabk}-document`,
    bundesland: null,
    dokument_typ: "Gesetz",
    prev: null,
    next: null,
  };
}

export function lawDocument(jurabk: string) {
  return {
    jurabk,
    doknr: `${jurabk}-document`,
    langue: "Regression law",
    kurzue: "Regression law",
    bundesland: null,
    doktyp: "Gesetz",
    standangaben: [{ standtyp: "Stand", standkommentar: "Published 2026-09-22" }],
  };
}

export function createLegalBasisFixture(
  url: string,
  lawResponse: (url: URL) => Response | Promise<Response>,
): LegalBasisFixture {
  const client = new SQL(url);
  const postgres = createPostgresRuntime({
    client,
    schema: legalBasisSchema,
  });
  const lawRequests: URL[] = [];
  const lawServer = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      lawRequests.push(url);
      return lawResponse(url);
    },
  });
  const dependencies = defineFeature({
    id: "legal-basis-postgres-test",
    needs: {},
    tables: projectLogicSchema,
    providers: [
      projectNodesProvider,
      projectsProvider,
      provideValue(PostgreSQL, postgres),
      provideValue(ExaminationConfiguration, { lawDatabaseBaseUrl: lawServer.url.href }),
    ] as const,
  });
  const resources = makeEffectResourceRuntime(composeFeatures([dependencies, feature] as const));
  const app = createHttpHost("legal-basis-postgres-test").use(
    createLegalBasisRoutes(createFeatureHttp(resources).for(feature)),
  );
  const projectIds: string[] = [];
  const cacheLaws: string[] = [];

  return {
    app,
    client,
    postgres,
    lawRequests,
    cacheLaws,
    async createProject() {
      const projectId = crypto.randomUUID();
      const topicId = crypto.randomUUID();
      projectIds.push(projectId);
      await postgres.query(async (database) => {
        await database.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() });
        await database.insert(topics).values({
          id: topicId,
          projectId,
          name: "Species protection",
          showInMvp: true,
          showInEwm: true,
          showInBeschluss: true,
        });
      });
      return { projectId, topicId };
    },
    async graphSnapshot(projectId: string) {
      const state: string[][] = [];
      for (const table of [
        "project",
        "topic",
        "topic_norm",
        "gesetz",
        "norm",
        "standangabe",
        "absatz",
        "satz",
        "topic_history",
        "topic_norm_history",
        "gesetz_history",
        "norm_history",
        "standangabe_history",
        "absatz_history",
        "satz_history",
      ]) {
        const rows = await client.unsafe<{ row: string }[]>(
          `SELECT row_to_json(snapshot)::text AS row FROM "${table}" AS snapshot WHERE "${table === "project" ? "id" : "project_id"}" = $1::uuid ORDER BY id, project_version`,
          [projectId],
        );
        state.push(rows.map(({ row }) => row));
      }
      return state;
    },
    async close() {
      lawServer.stop(true);
      try {
        for (const projectId of projectIds) {
          await client`DELETE FROM gesetz WHERE project_id = ${projectId}::uuid`;
          await client`DELETE FROM project WHERE id = ${projectId}::uuid`;
          await client`DELETE FROM project_version_lock WHERE project_id = ${projectId}::uuid`;
          for (const table of [
            "topic_history",
            "topic_norm_history",
            "gesetz_history",
            "norm_history",
            "standangabe_history",
            "absatz_history",
            "satz_history",
            "audit_log",
          ]) {
            await client.unsafe(`DELETE FROM "${table}" WHERE project_id = $1::uuid`, [projectId]);
          }
          await client`DELETE FROM project_history WHERE id = ${projectId}::uuid`;
        }
        for (const jurabk of cacheLaws) {
          await client`DELETE FROM norm_deconstruction WHERE jurabk = ${jurabk}`;
          await client`DELETE FROM norm_deconstruction_history WHERE jurabk = ${jurabk}`;
        }
      } finally {
        await resources.close();
        await postgres.close();
        await client.close();
      }
    },
  };
}
