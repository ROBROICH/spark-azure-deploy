import { defineNodeEntities, nodeV2AuthPolicies } from "@spark-workflow/node-crud";

import {
  administrativeFileDraftDescriptor,
  AdministrativeFileDraftNodes,
} from "./node/descriptor.ts";

export const administrativeFileDraftEntities = defineNodeEntities({
  id: "administrative-file-draft",
  controller: "administrative-file-draft.v2.nodes",
  descriptor: administrativeFileDraftDescriptor,
  nodes: AdministrativeFileDraftNodes,
  needs: {},
  entities: [
    { nodeType: "risks", collection: "risks", auth: nodeV2AuthPolicies },
    { nodeType: "vae_node", collection: "vae-nodes", auth: nodeV2AuthPolicies },
  ],
});
