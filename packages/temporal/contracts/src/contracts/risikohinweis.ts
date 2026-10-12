import { Type, type Static } from "@sinclair/typebox";

import { GeneratedUUID, type WorkflowName } from "../registry.js";

export const RISIKOHINWEIS_TASK_QUEUE = "risikohinweiser" as const;
export const RISIKOHINWEIS_WORKFLOW = "RiskCheckerWorkflow" as WorkflowName<"RiskCheckerWorkflow">;

const contracts = Type.Module({
  GeneratedUUID,
  PFBChapter: Type.Object(
    {
      id: Type.Ref("GeneratedUUID"),
      title: Type.Optional(Type.Union([Type.String(), Type.Null()])),
      text: Type.String(),
    },
    { additionalProperties: false },
  ),
  RiskFinding: Type.Object(
    {
      riskId: Type.Ref("GeneratedUUID"),
      chapterId: Type.Ref("GeneratedUUID"),
      quote: Type.String(),
      description: Type.String(),
      implications: Type.String(),
      recommendation: Type.String(),
      severity: Type.Integer({ minimum: 1, maximum: 10 }),
    },
    { additionalProperties: false },
  ),
  RiskFinderOutput: Type.Object(
    {
      risks: Type.Array(Type.Ref("RiskFinding")),
    },
    { additionalProperties: false },
  ),
});

export const PFBChapter = contracts.Import("PFBChapter");
export const RiskFinding = contracts.Import("RiskFinding");
export const RiskFinderOutput = contracts.Import("RiskFinderOutput");

export type PFBChapter = Static<typeof PFBChapter>;
export type RiskFinding = Static<typeof RiskFinding>;
export type RiskFinderOutput = Static<typeof RiskFinderOutput>;
