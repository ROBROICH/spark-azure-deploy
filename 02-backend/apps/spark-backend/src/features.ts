import * as administrativeFileDraft from "@spark-workflow/administrative-file-draft";
import * as agentOrchestration from "@spark-workflow/agent-orchestration-service";
import * as core from "@spark-workflow/core";
import * as examination from "@spark-workflow/examination-service";
import * as fpp from "@spark-workflow/fpp-service";
import * as identity from "@spark-workflow/identity-management-service";
import { parsePostgresPoolOptions, providePostgreSQL } from "@spark-workflow/postgres-runtime";
import { composeFeatures, defineFeature, provideValue } from "@spark-workflow/resource";
import * as temporalJobs from "@spark-workflow/temporal-job-service";
import { Redacted } from "effect";

import type { ApplicationEnvironment } from "./env.ts";
import { registeredFeatures, applicationSchema } from "./manifests.ts";

function runtimeDatabaseUrl(environment: ApplicationEnvironment): Redacted.Redacted<string> {
  const url = new URL("postgresql://localhost");
  url.hostname = environment.DB_HOST;
  url.port = String(environment.DB_PORT);
  url.username = environment.DB_USER;
  url.password = Redacted.value(environment.DB_PASSWORD);
  url.pathname = environment.DB_NAME;
  return Redacted.make(url.href);
}

export function composeApplicationFeatures(
  environment: ApplicationEnvironment,
  source: typeof process.env,
  projectConfiguration: ReturnType<typeof core.parseProjectConfiguration>,
) {
  const runtimeDependencies = defineFeature({
    id: "runtime-dependencies",
    needs: {},
    providers: [
      providePostgreSQL({
        pool: parsePostgresPoolOptions(source),
        url: runtimeDatabaseUrl(environment),
        schema: applicationSchema,
      }),
      provideValue(
        administrativeFileDraft.AdministrativeFileDraftConfiguration,
        administrativeFileDraft.parseAdministrativeFileDraftConfiguration(source),
      ),
      provideValue(
        agentOrchestration.AosCommandConfiguration,
        agentOrchestration.parseAosCommandConfiguration(source),
      ),
      provideValue(
        core.DocumentCommandConfiguration,
        core.parseDocumentCommandConfiguration(source),
      ),
      provideValue(core.DocumentConfiguration, core.parseDocumentConfiguration(source)),
      provideValue(
        examination.ExaminationConfiguration,
        examination.parseExaminationConfiguration(source),
      ),
      provideValue(fpp.FppConfiguration, fpp.parseFppConfiguration(source)),
      provideValue(identity.IdentityConfiguration, identity.parseIdentityEnvironment(source)),
      provideValue(core.ProjectCommandConfiguration, core.parseProjectCommandConfiguration(source)),
      provideValue(core.ProjectConfiguration, projectConfiguration),
      provideValue(
        temporalJobs.TemporalQueryConfiguration,
        temporalJobs.parseTemporalQueryConfiguration(source),
      ),
    ],
    tables: {},
  });
  return composeFeatures([...registeredFeatures, runtimeDependencies]);
}
