import { authentication, type Permission } from "@spark-workflow/authentification";
import { Result } from "better-result";
import { Elysia } from "elysia";

import {
  bindNodeRuntime,
  createNodeRoutes,
  defineNodeDescriptor,
  type NodePersistence,
  NodePermissionError,
  NodeVersionError,
} from "../../../src";
import { formalCompletenessNodeMetadata, formalCompletenessSchema } from "./schema";

export interface RepresentativeAppOptions {
  readonly latestVersion?: number;
  readonly allowedFieldPermissions?: ReadonlySet<Permission>;
}

const postgresErrorFacts = (error: Error) => {
  const cause = error.cause instanceof Error ? error.cause : error;
  return {
    code: "code" in cause && cause.code === "23503" ? "23503" : undefined,
    message: cause.message,
  };
};

export const createRepresentativeApp = (
  persistence: NodePersistence<typeof formalCompletenessSchema>,
  options: RepresentativeAppOptions = {},
) => {
  const latestVersion = options.latestVersion ?? 1;
  const descriptor = defineNodeDescriptor({
    name: "formal-completeness-representative",
    auditLogEnabled: true,
    schema: formalCompletenessSchema,
    nodeMetadata: formalCompletenessNodeMetadata,
  });
  const runtime = bindNodeRuntime(descriptor, {
    persistence,
    versionPeer: {
      validateWriteVersion: async (_projectId, version) => {
        if (version !== latestVersion) {
          return Result.err(
            NodeVersionError({
              internal: {
                message: `Provided project version ${version} is not the latest version ${latestVersion}`,
              },
            }),
          );
        }
        return Result.ok(undefined);
      },
      resolveLatestVersion: async () => Result.ok(latestVersion),
      validateVersionLock: async () => Result.ok(undefined),
    },
    authorizeFields: async ({ checks }) => {
      for (const check of checks) {
        if (
          check.permissions.some((permission) => !options.allowedFieldPermissions?.has(permission))
        ) {
          return Result.err(
            NodePermissionError({
              internal: {
                nodeType: check.nodeType,
                field: check.field,
                action: check.action,
              },
            }),
          );
        }
      }
      return Result.ok(undefined);
    },
  });

  const routes = createNodeRoutes(
    new Elysia({ name: "formal-completeness-representative.routes" }).use(authentication),
    descriptor,
    () => runtime,
  );

  return new Elysia({
    name: "formal-completeness-representative.app",
  })
    .onError({ as: "global" }, ({ error, set }) => {
      const facts = postgresErrorFacts(error instanceof Error ? error : new Error(String(error)));
      if (facts.code !== "23503" && !/violates foreign key constraint/i.test(facts.message)) {
        return;
      }
      set.status = 409;
      return { detail: "PostgreSQL foreign key constraint violation" };
    })
    .use(routes);
};
