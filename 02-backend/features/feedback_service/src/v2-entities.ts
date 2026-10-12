import { defineNodeEntities, nodeDefinition, nodeV2AuthPolicies } from "@spark-workflow/node-crud";
import { Type } from "@sinclair/typebox";

import { feedbackDescriptor, FeedbackNodes } from "./node.ts";

export const feedbackEntities = defineNodeEntities({
  id: "feedback",
  controller: "feedback-service.v2.nodes",
  descriptor: feedbackDescriptor,
  nodes: FeedbackNodes,
  needs: {},
  entities: [
    {
      nodeType: "feedback",
      collection: "feedback",
      auth: nodeV2AuthPolicies,
      operations: {
        update: {
          body: Type.Omit(nodeDefinition(feedbackDescriptor, "feedback").schemas.patch, ["userId"]),
        },
      },
      mutations: (_capability, standard) => ({
        create: (input) =>
          standard.create({
            ...input,
            body: { ...input.body, userId: input.auth.user?.sub ?? input.body.userId },
          }),
      }),
    },
  ],
});
