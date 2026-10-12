import { authentication } from "@spark-workflow/authentification";
import { Elysia } from "elysia";

import {
  bindNodeRuntime,
  createNodeRoutes,
  createNodeVersionRoutes,
  defineNodeDescriptor,
  type NodePersistence,
  type ProjectVersionPeer,
} from "../../../src";
import {
  formalCompletenessNodeMetadata,
  formalCompletenessSchema,
} from "../formal-completeness/schema";

export const createVersionOperationsApp = (
  persistence: NodePersistence<typeof formalCompletenessSchema>,
  peer: ProjectVersionPeer,
) => {
  const descriptor = defineNodeDescriptor({
    name: "formal-completeness-version-representative",
    auditLogEnabled: true,
    schema: formalCompletenessSchema,
    nodeMetadata: formalCompletenessNodeMetadata,
  });
  const runtime = bindNodeRuntime(descriptor, {
    persistence,
    versionPeer: peer,
  });

  const app = new Elysia({
    name: "formal-completeness-version-representative.app",
  }).use(authentication);
  return createNodeVersionRoutes(
    createNodeRoutes(app, descriptor, () => runtime),
    descriptor,
    () => runtime,
  );
};
