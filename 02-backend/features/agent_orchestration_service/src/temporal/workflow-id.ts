import type { WorkflowName } from "@spark-temporal/contracts";

/** `<name>-<project>-v<version>`, then `-<subject>` for runs per norm or VAE node. The frontend matches this shape. */
export const workflowId = (
  name: WorkflowName,
  projectId: string,
  version: number,
  subjectId?: string,
): string =>
  `${name}-${projectId}-v${version}${subjectId === undefined ? "" : `-${subjectId}`}`;
