import { defineNodeEntities, nodeV2AuthPolicies } from "@spark-workflow/node-crud";

import { objectionsDescriptor, ObjectionsNodes } from "./node/descriptor.ts";

export const objectionsEntities = defineNodeEntities({
  id: "objections-management",
  controller: "objections-management.v2.nodes",
  descriptor: objectionsDescriptor,
  nodes: ObjectionsNodes,
  needs: {},
  entities: [
    { nodeType: "argument", collection: "arguments", auth: nodeV2AuthPolicies },
    {
      nodeType: "beteiligungs_eingang",
      collection: "beteiligungs-eingaenge",
      auth: nodeV2AuthPolicies,
    },
    {
      nodeType: "beteiligungs_eingang_markdown",
      collection: "beteiligungs-eingang-markdowns",
      auth: nodeV2AuthPolicies,
    },
  ],
});
