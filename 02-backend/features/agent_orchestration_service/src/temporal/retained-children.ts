import { isDeepStrictEqual } from "node:util";
import {
  type RechtsmethodikWorkflowOutput as RechtsmethodikResult,
  type SatzOrchestratorWorkflowInput as SatzChildInput,
  type SatzOrchestratorWorkflowOutput as SatzChildOutput,
} from "@spark-temporal/contracts";
import {
  type RechtsmethodikChildInput,
  type RetainedChildCatalog,
} from "./norm-contracts.ts";

export class RetainedChildFixtureMatchError extends Error {
  constructor(kind: "rechtsmethodik" | "satz", input: RechtsmethodikChildInput | SatzChildInput) {
    super(`No exact retained ${kind} child fixture for ${JSON.stringify(input)}`);
    this.name = "RetainedChildFixtureMatchError";
  }
}

export interface RetainedChildBoundary {
  rechtsmethodik(input: RechtsmethodikChildInput): Promise<RechtsmethodikResult>;
  satz(input: SatzChildInput): Promise<SatzChildOutput>;
}

export function createRetainedChildFixture(value: RetainedChildCatalog): RetainedChildBoundary {
  const catalog = value;
  return {
    async rechtsmethodik(input) {
      const fixture = catalog.fixtures.find(
        (candidate) =>
          candidate.kind === "rechtsmethodik" && isDeepStrictEqual(candidate.input, input),
      );
      if (fixture?.kind !== "rechtsmethodik") {
        throw new RetainedChildFixtureMatchError("rechtsmethodik", input);
      }
      return structuredClone(fixture.output);
    },
    async satz(input) {
      const fixture = catalog.fixtures.find(
        (candidate) => candidate.kind === "satz" && isDeepStrictEqual(candidate.input, input),
      );
      if (fixture?.kind !== "satz") {
        throw new RetainedChildFixtureMatchError("satz", input);
      }
      return structuredClone(fixture.output);
    },
  };
}
