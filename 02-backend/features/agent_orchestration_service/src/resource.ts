import { defineResource } from "@spark-workflow/resource";
import type { AosCommandConfiguration as AosCommandConfigurationValue } from "./env.ts";
import type { AosTemporalCommandsService } from "./temporal/commands.ts";

export const AosCommandConfiguration = defineResource<AosCommandConfigurationValue>()(
  "agent-orchestration/CommandConfiguration",
);
export const AosTemporalCommands = defineResource<AosTemporalCommandsService>()(
  "agent-orchestration/TemporalCommands",
);
