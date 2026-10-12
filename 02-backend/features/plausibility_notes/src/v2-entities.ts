import { defineNodeEntities, nodeV2AuthPolicies } from "@spark-workflow/node-crud";

import { plausibilityDescriptor, PlausibilityNodes } from "./nodes.ts";

export const plausibilityNoteEntities = defineNodeEntities({
  id: "plausibility-notes",
  controller: "plausibility-notes.v2.nodes",
  descriptor: plausibilityDescriptor,
  nodes: PlausibilityNodes,
  needs: {},
  entities: [
    { nodeType: "plausibility_note", collection: "plausibility-notes", auth: nodeV2AuthPolicies },
    {
      nodeType: "plausibility_note_occurrence",
      collection: "plausibility-note-occurrences",
      auth: nodeV2AuthPolicies,
    },
  ],
});
