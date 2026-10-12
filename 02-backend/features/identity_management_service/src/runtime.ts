import { PostgreSQL } from "@spark-workflow/postgres-runtime/postgresql";
import { provide } from "@spark-workflow/resource";
import { Result } from "better-result";
import { EvlogError } from "evlog";

import { identityDatabaseSchema, spiceDbMigrations } from "./db/schema.ts";
import { identityErrors } from "./errors.ts";
import { loadSpiceDbRevisions } from "./migrations/revisions.ts";
import { KeycloakAdminClient } from "./providers/keycloak.ts";
import { SpiceDbClient } from "./providers/spicedb.ts";
import { Identity, IdentityConfiguration, type IdentityService } from "./resource.ts";

const assignmentsByService = new WeakMap<IdentityService, SpiceDbClient>();

export const identityProvider = provide({
  resource: Identity,
  needs: { postgres: PostgreSQL, configuration: IdentityConfiguration },
  make: ({ postgres, configuration }) => {
    const scope = postgres.scope(identityDatabaseSchema);
    const users = new KeycloakAdminClient({
      baseUrl: configuration.AUTH_BASE_URL,
      realm: configuration.AUTH_REALM,
      clientId: configuration.AUTH_CLIENT_ID,
      clientSecret: configuration.AUTH_CLIENT_SECRET,
    });
    const roles =
      configuration.AUTH_PRIVILEGED === null ||
      configuration.ENV === undefined ||
      !["dev", "development", "local", "testing", "staging"].includes(configuration.ENV) ||
      configuration.AUTH_REALM.toLowerCase() === "production"
        ? undefined
        : new KeycloakAdminClient({
            baseUrl: configuration.AUTH_BASE_URL,
            realm: configuration.AUTH_REALM,
            authRealm: configuration.AUTH_PRIVILEGED.realm,
            clientId: configuration.AUTH_PRIVILEGED.clientId,
            clientSecret: configuration.AUTH_PRIVILEGED.clientSecret,
          });
    const assignments = new SpiceDbClient({
      endpoint: configuration.AUTH_SPICE_DB_ENDPOINT,
      token: configuration.AUTH_SPICE_DB_TOKEN,
      certPath: configuration.AUTH_SPICE_DB_CERT_PATH,
      insecure: configuration.AUTH_SPICE_DB_INSECURE,
      bulkChunkSize: configuration.AUTH_SPICE_DB_BULK_CHUNK_SIZE,
    });

    const service = Object.freeze<IdentityService>({
      users,
      roles,
      assignments,
      async upgrade() {
        const upgraded = await Result.tryPromise({
          try: async () => {
            const revisions = await loadSpiceDbRevisions();
            const applied = new Set(
              await scope.query(async (database) =>
                (
                  await database
                    .select({ version: spiceDbMigrations.version })
                    .from(spiceDbMigrations)
                ).map(({ version }) => version),
              ),
            );
            for (const revision of revisions) {
              if (applied.has(revision.version)) continue;
              const written = await assignments.writeSchema(revision.schema);
              if (written.isErr()) throw written.error;
              await scope.query(async (database) => {
                await database
                  .insert(spiceDbMigrations)
                  .values({ version: revision.version })
                  .onConflictDoNothing();
              });
            }
            const latest = revisions.at(-1);
            if (latest === undefined) return;
            const matches = await assignments.schemaMatches(latest.schema);
            if (matches.isErr()) throw matches.error;
            if (!matches.value) {
              const written = await assignments.writeSchema(latest.schema);
              if (written.isErr()) throw written.error;
            }
          },
          catch: (cause) =>
            EvlogError.isEvlogError(cause)
              ? cause
              : identityErrors.DATABASE_UNAVAILABLE({
                  cause: cause instanceof Error ? cause : undefined,
                }),
        });
        if (upgraded.isErr()) throw upgraded.error;
      },
    });
    assignmentsByService.set(service, assignments);
    return service;
  },
  release: (service) => {
    assignmentsByService.get(service)?.close();
    assignmentsByService.delete(service);
  },
});
