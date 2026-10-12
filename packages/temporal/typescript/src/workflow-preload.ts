import { plugin } from "bun";

import { sparkTemporalWorkflowBun } from "./workflow-plugin.ts";

plugin(sparkTemporalWorkflowBun());
