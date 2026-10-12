import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { Result } from "better-result";

import { NodeVersionError, type ProjectVersionPeer } from "../../../src";

const latestVersionResponse = Type.Object(
  {
    projectId: Type.Optional(Type.String({ format: "uuid" })),
    latestVersion: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export const createProjectLogicClient = (baseUrl: string): ProjectVersionPeer => {
  const base = baseUrl.replace(/\/$/, "");
  return {
    validateWriteVersion: async () => Result.ok(undefined),

    async resolveLatestVersion(projectId) {
      const response = await fetch(`${base}/projects/${projectId}/latest-version`);
      if (!response.ok) {
        return Result.err(NodeVersionError({ internal: { message: await response.text() } }));
      }
      const value: unknown = await response.json();
      if (!Value.Check(latestVersionResponse, value)) {
        return Result.err(
          NodeVersionError({
            internal: {
              message: "Project Logic returned an invalid latest-version response",
            },
          }),
        );
      }
      return Result.ok(value.latestVersion);
    },

    async validateVersionLock({ projectId, sourceVersion, targetVersion, lockToken }) {
      const response = await fetch(`${base}/projects/${projectId}/version-lock/validate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourceVersion: sourceVersion,
          targetVersion: targetVersion,
          lockToken: lockToken,
        }),
      });
      if (!response.ok) {
        return Result.err(NodeVersionError({ internal: { message: await response.text() } }));
      }
      return Result.ok(undefined);
    },
  };
};
