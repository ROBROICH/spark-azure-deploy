import { serviceName } from "./process-output.ts";

import { SQL } from "bun";
import { resolve } from "node:path";
import { Elysia, t } from "elysia";

import * as administrativeFileDraft from "@spark-workflow/administrative-file-draft";
import * as agentOrchestration from "@spark-workflow/agent-orchestration-service";
import * as comments from "@spark-workflow/comment-service";
import * as core from "@spark-workflow/core";
import * as examination from "@spark-workflow/examination-service";
import * as feedback from "@spark-workflow/feedback-service";
import * as formalCompleteness from "@spark-workflow/formal-completeness-check";
import * as fpp from "@spark-workflow/fpp-service";
import {
  canonicalizeOpenApiSchemaReferences,
  createFeatureHttp,
  createHttpHost,
  createHttpHostState,
} from "@spark-workflow/http-host";
import { migrateDatabase, withSessionLock } from "@spark-workflow/http-host/migrations";
import { processFailed } from "@spark-workflow/http-host/process-output";
import * as identity from "@spark-workflow/identity-management-service";
import * as objections from "@spark-workflow/objections-management-service";
import * as plausibility from "@spark-workflow/plausibility-notes";
import { PostgreSQL } from "@spark-workflow/postgres-runtime";
import * as protocol from "@spark-workflow/protocol-service";
import { makeEffectResourceRuntime } from "@spark-workflow/resource/effect";
import * as supplementaryRequests from "@spark-workflow/supplementary-requests-service";
import * as temporalJobs from "@spark-workflow/temporal-job-service";
import { cors } from "@elysiajs/cors";
import { log } from "evlog";
import { Redacted } from "effect";

import { parseApplicationEnvironment, type ApplicationEnvironment } from "./env.ts";
import { composeApplicationFeatures } from "./features.ts";

const seedLockId = 1_752_041_504;
/** Shutdown signals, plus the unhandled errors after which the process output owner ends the process. */
const stopEvents = ["SIGINT", "SIGTERM", "uncaughtException", "unhandledRejection"];

interface FeatureWorker {
  readonly done: Promise<void>;
  close(): Promise<void>;
}

function migrationClient(environment: ApplicationEnvironment): SQL {
  return new SQL({
    adapter: "postgres",
    hostname: environment.DB_MIGRATE_HOST,
    port: environment.DB_PORT,
    database: environment.DB_NAME,
    username: environment.DB_MIGRATE_USER,
    password: Redacted.value(environment.DB_MIGRATE_PASSWORD),
    prepare: false,
    max: 1,
  });
}

export async function createApplication() {
  const environment = parseApplicationEnvironment(process.env);
  const projectConfiguration = core.parseProjectConfiguration(process.env);
  const features = composeApplicationFeatures(environment, process.env, projectConfiguration);
  const resources = makeEffectResourceRuntime(features);
  const protocolHistory = protocol.createProtocolHistory(async () =>
    (await resources.get(PostgreSQL)).scope({}),
  );
  const featureHttp = createFeatureHttp(resources);
  const state = createHttpHostState();
  const corsOrigins = environment.PROJECT_LOGIC_SERVICE_CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const legacyRoutes = new Elysia({ name: "application.v1-routes", normalize: false }).guard(
    {
      schema: "standalone",
      query: t.Object({ projectVersion: t.Optional(t.Numeric({ minimum: 1 })) }),
    },
    (group) =>
      group
        .group("/api/pls/v1", (group) =>
          group.use(core.createProjectsRoutes(featureHttp.for(core.coreFeature))),
        )
        .group("/api/dms/v1", (group) =>
          group.use(core.createDocumentsRoutes(featureHttp.for(core.coreFeature))),
        )
        .group("/api/vae/v1", (group) =>
          group.use(
            administrativeFileDraft.createRoutes(featureHttp.for(administrativeFileDraft.feature)),
          ),
        )
        .group("/api/agent-orchestration/v1", (group) =>
          group.use(agentOrchestration.createRoutes(featureHttp.for(agentOrchestration.feature))),
        )
        .group("/api/comment/v1", (group) =>
          group.use(comments.createRoutes(featureHttp.for(comments.feature))),
        )
        .group("/api/examination/v1", (group) =>
          group.use(examination.createRoutes(featureHttp.for(examination.feature))),
        )
        .group("/api/feedback/v1", (group) =>
          group.use(feedback.createRoutes(featureHttp.for(feedback.feature))),
        )
        .group("/api/fcs/v1", (group) =>
          group.use(formalCompleteness.createRoutes(featureHttp.for(formalCompleteness.feature))),
        )
        .group("/api/fpp/v1", (group) => group.use(fpp.createRoutes(featureHttp.for(fpp.feature))))
        .group("/api/identity", (group) =>
          group.use(identity.createRoutes(featureHttp.for(identity.feature))),
        )
        .group("/api/oms/v1", (group) =>
          group.use(objections.createRoutes(featureHttp.for(objections.feature))),
        )
        .group("/api/plausibility-notes/v1", (group) =>
          group.use(plausibility.createRoutes(featureHttp.for(plausibility.feature))),
        )
        .group("/api/protocol/v1", (group) => group.use(protocol.createRoutes(protocolHistory)))
        .group("/api/supplementary-requests/v1", (group) =>
          group.use(
            supplementaryRequests.createRoutes(featureHttp.for(supplementaryRequests.feature)),
          ),
        )
        .group("/api", (group) =>
          group.use(temporalJobs.createRoutes(featureHttp.for(temporalJobs.feature))),
        ),
  );
  const app = createHttpHost(serviceName, {
    openApiTitle: "SPARK Workflow",
    eventAttributes:
      environment.API_POOL === undefined ? undefined : { "api.pool": environment.API_POOL },
    mapOpenApi: canonicalizeOpenApiSchemaReferences,
    state,
  })
    .use(
      cors({
        allowedHeaders: true,
        credentials: true,
        exposeHeaders: [],
        maxAge: 600,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        origin: corsOrigins,
      }),
    )
    .use(legacyRoutes)
    .group("/api/v2/pls", (group) =>
      group.use(core.createProjectV2Routes(featureHttp.for(core.coreFeature))),
    )
    .group("/api/v2/dms", (group) =>
      group.use(core.createDocumentV2Routes(featureHttp.for(core.coreFeature))),
    )
    .group("/api/v2/vae", (group) =>
      group.use(
        administrativeFileDraft.createV2Routes(featureHttp.for(administrativeFileDraft.feature)),
      ),
    )
    .group("/api/v2/comment", (group) =>
      group.use(comments.createV2Routes(featureHttp.for(comments.feature))),
    )
    .group("/api/v2/examination", (group) =>
      group.use(examination.createV2Routes(featureHttp.for(examination.feature))),
    )
    .group("/api/v2/feedback", (group) =>
      group.use(feedback.createV2Routes(featureHttp.for(feedback.feature))),
    )
    .group("/api/v2/fcs", (group) =>
      group.use(formalCompleteness.createV2Routes(featureHttp.for(formalCompleteness.feature))),
    )
    .group("/api/v2/oms", (group) =>
      group.use(objections.createV2Routes(featureHttp.for(objections.feature))),
    )
    .group("/api/v2/plausibility-notes", (group) =>
      group.use(plausibility.createV2Routes(featureHttp.for(plausibility.feature))),
    )
    .group("/api/v2/supplementary-requests", (group) =>
      group.use(
        supplementaryRequests.createV2Routes(featureHttp.for(supplementaryRequests.feature)),
      ),
    );
  let worker: FeatureWorker | undefined;
  let startCalled = false;
  let startPromise: Promise<void> | undefined;
  let stopRequested = false;
  let stopPromise: Promise<void> | undefined;
  let cleanupPromise: Promise<void> | undefined;
  let stopOnEvent: (() => void) | undefined;

  const migrate = async (): Promise<void> => {
    const client = migrationClient(environment);
    try {
      await migrateDatabase(client, resolve(import.meta.dirname, "migrations"));
    } finally {
      await client.close();
    }
  };

  const seed = async (): Promise<void> => {
    const client = migrationClient(environment);
    try {
      await withSessionLock(client, seedLockId, async () => {
        const postgres = await resources.get(PostgreSQL);
        await core.seedCoreDatabase(postgres);
        await (await resources.get(identity.Identity)).upgrade();
      });
    } finally {
      await client.close();
    }
  };

  const startWorker = async (): Promise<FeatureWorker | undefined> => {
    switch (environment.ACTIVE_FEATURE_WORKER) {
      case "none":
        return undefined;
      case "agent-orchestration": {
        const configuration = agentOrchestration.parseAosWorkerConfiguration(process.env);
        const commands = await resources.get(agentOrchestration.AosTemporalCommands);
        return agentOrchestration.startAosTemporalWorker({
          projects: await resources.get(agentOrchestration.feature.needs.projects),
          documents: await resources.get(agentOrchestration.feature.needs.documents),
          projectLogic: await resources.get(agentOrchestration.feature.needs.projectLogic),
          formalCompleteness: await resources.get(
            agentOrchestration.feature.needs.formalCompleteness,
          ),
          plausibility: await resources.get(agentOrchestration.feature.needs.plausibility),
          examination: await resources.get(agentOrchestration.feature.needs.examination),
          administrativeFileDraft: await resources.get(
            agentOrchestration.feature.needs.administrativeFileDraft,
          ),
          fppFiles: await resources.get(agentOrchestration.feature.needs.fppFiles),
          objections: await resources.get(agentOrchestration.feature.needs.objections),
          configuration,
          commands,
          reportWorkflowStatus: temporalJobs.createWorkflowStatusReporter(
            await resources.get(PostgreSQL),
          ),
        });
      }
      case "document-management": {
        const configuration = core.parseDocumentWorkerConfiguration(process.env);
        const runtime = await resources.get(core.DocumentRuntimeResource);
        return core.startDocumentWorker(
          runtime,
          configuration,
          temporalJobs.createWorkflowStatusReporter(await resources.get(PostgreSQL)),
        );
      }
      case "project-logic": {
        const configuration = core.parseProjectWorkerConfiguration(process.env);
        const postgres = await resources.get(PostgreSQL);
        const projectLogic = await resources.get(core.ProjectLogicVersioning);
        const documentManagement = await resources.get(core.DocumentManagementVersioning);
        const formalCompletenessVersioning = await resources.get(
          formalCompleteness.FormalCompletenessVersioning,
        );
        const administrativeFileDraftVersioning = await resources.get(
          administrativeFileDraft.AdministrativeFileDraftVersioning,
        );
        return core.startProjectLogicTemporalWorker(
          postgres,
          configuration,
          {
            nodes: {
              projectLogicService: projectLogic,
              documentManagementService: documentManagement,
              formalCompletenessCheck: formalCompletenessVersioning,
              plausibilityNotes: await resources.get(plausibility.PlausibilityNotesVersioning),
              examinationService: await resources.get(examination.ExaminationVersioning),
              administrativeFileDraft: administrativeFileDraftVersioning,
              objectionsManagementService: await resources.get(objections.ObjectionsVersioning),
            },
            documentManagement,
            formalCompleteness: formalCompletenessVersioning,
            administrativeFileDraft: administrativeFileDraftVersioning,
          },
          temporalJobs.createWorkflowStatusReporter(postgres),
        );
      }
      case "temporal-job": {
        const configuration = temporalJobs.parseTemporalJobWorkerConfiguration(process.env);
        const temporalWorker = await import("@spark-workflow/temporal-job-service/worker");
        return temporalWorker.startTemporalJobWorker({
          configuration,
          postgres: await resources.get(PostgreSQL),
        });
      }
    }
  };

  const cleanup = (): Promise<void> =>
    (cleanupPromise ??= (async () => {
      state.markDraining();
      if (stopOnEvent !== undefined) {
        for (const event of stopEvents) process.off(event, stopOnEvent);
        stopOnEvent = undefined;
      }
      const errors: unknown[] = [];
      for (const close of [
        () => worker?.close(),
        () => (app.server ? app.stop() : undefined),
        () => resources.close(),
      ]) {
        try {
          await close();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length > 0) {
        throw new AggregateError(errors, "Failed to stop application");
      }
    })());

  const stop = (): Promise<void> => {
    stopRequested = true;
    return (stopPromise ??= (async () => {
      try {
        await startPromise;
      } catch {}
      await cleanup();
    })());
  };

  const stopAfter = async (error: Error, message: string): Promise<never> => {
    stopRequested = true;
    try {
      await cleanup();
    } catch (stopError) {
      throw new AggregateError([error, stopError], message);
    }
    throw error;
  };

  const start = (): Promise<void> => {
    if (startCalled || stopRequested) {
      return Promise.reject(new Error("Application can only be started once"));
    }
    startCalled = true;
    const continueStarting = (): void => {
      if (stopRequested || processFailed()) throw new Error("Application was stopped while starting");
    };
    return (startPromise = (async () => {
      try {
        await migrate();
        continueStarting();
        await resources.ready();
        continueStarting();
        await seed();
        continueStarting();
        worker = await startWorker();
        continueStarting();
        if (worker !== undefined) {
          void worker.done
            .then(
              () =>
                !stopRequested
                  ? stopAfter(
                      new Error("Feature worker stopped unexpectedly"),
                      "Failed to stop application",
                    )
                  : undefined,
              (error) =>
                !stopRequested
                  ? stopAfter(
                      error instanceof Error
                        ? error
                        : new Error("Feature worker failed", { cause: error }),
                      "Failed to stop application after its feature worker failed",
                    )
                  : undefined,
            )
            .catch((error) => {
              log.error({
                message: "Application stopped after its feature worker terminated",
                error,
              });
              process.exitCode = 1;
            });
        }
        stopOnEvent = () => {
          void stop().catch((error) => {
            log.error({ message: "Failed to stop application", error });
            process.exitCode = 1;
          });
        };
        for (const event of stopEvents) process.once(event, stopOnEvent);
        app.listen({ hostname: environment.HOST, port: environment.PORT });
        state.markAccepting();
      } catch (error) {
        await stopAfter(
          error instanceof Error
            ? error
            : new Error("Failed to start application", { cause: error }),
          "Failed to start and stop application",
        );
      }
    })());
  };

  return Object.freeze({ app, features, migrate, resources, seed, start, stop });
}

export type Application = Awaited<ReturnType<typeof createApplication>>;
export type App = Application["app"];

if (import.meta.main) {
  const application = await createApplication();
  await application.start();
}
