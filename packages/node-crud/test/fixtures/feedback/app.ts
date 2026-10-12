import { authentication } from "@spark-workflow/authentification";
import { Elysia } from "elysia";
import { Result } from "better-result";

import {
  bindNodeRuntime,
  createNodeRoutes,
  defineNodeDescriptor,
  type NodePersistence,
} from "../../../src";
import { feedbackNodeMetadata, feedbackSchema } from "./schema";

export const createFeedbackApp = (persistence: NodePersistence<typeof feedbackSchema>) => {
  const descriptor = defineNodeDescriptor({
    name: "feedback-audit-disabled",
    auditLogEnabled: false,
    schema: feedbackSchema,
    nodeMetadata: feedbackNodeMetadata,
  });
  const runtime = bindNodeRuntime(descriptor, {
    persistence,
    versionPeer: {
      validateWriteVersion: async () => Result.ok(undefined),
      resolveLatestVersion: async () => Result.ok(1),
      validateVersionLock: async () => Result.ok(undefined),
    },
  });

  return createNodeRoutes(
    new Elysia({ name: "feedback-audit-disabled.app" }).use(authentication),
    descriptor,
    () => runtime,
  );
};
