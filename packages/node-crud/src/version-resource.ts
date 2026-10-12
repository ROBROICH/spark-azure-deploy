import type { NodeRuntime, NodeSchema } from "./descriptor";
import { listNodeSummaries } from "./service";
import type { NodeSummary } from "./values";
import {
  copyProjectVersionNodes,
  type CopyVersionNodeInput,
  undoProjectVersionNodes,
} from "./version-operations";

export interface NodeVersionService {
  listNodes(projectId: string, projectVersion: number): Promise<readonly NodeSummary[]>;
  copyVersion(input: {
    readonly projectId: string;
    readonly sourceVersion: number;
    readonly targetVersion: number;
    readonly lockToken: string;
    readonly nodes: readonly CopyVersionNodeInput[];
    readonly dryRun: boolean;
  }): Promise<{ readonly dryRun: boolean; readonly copied: number }>;
  undoVersion(input: {
    readonly projectId: string;
    readonly targetVersion: number;
    readonly lockToken: string;
  }): Promise<{ readonly deleted: Readonly<Record<string, number>> }>;
}

export function createNodeVersionService<Schema extends NodeSchema>(
  descriptor: NodeRuntime<Schema>,
): NodeVersionService {
  return Object.freeze({
    async listNodes(projectId, projectVersion) {
      return listNodeSummaries(descriptor, projectId, projectVersion);
    },
    async copyVersion(input) {
      const result = await copyProjectVersionNodes({
        descriptor,
        projectId: input.projectId,
        sourceVersion: input.sourceVersion,
        targetVersion: input.targetVersion,
        lockToken: input.lockToken,
        nodes: input.nodes,
        dryRun: input.dryRun,
      });
      if (result.isErr()) throw result.error;
      return { dryRun: input.dryRun, copied: result.value.copied };
    },
    async undoVersion(input) {
      return undoProjectVersionNodes({
        descriptor,
        projectId: input.projectId,
        targetVersion: input.targetVersion,
        lockToken: input.lockToken,
      });
    },
  } satisfies NodeVersionService);
}
