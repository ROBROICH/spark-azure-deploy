import { isDeepStrictEqual } from "node:util";
import {
  type BewertungsWorkflowInput as BewertungsChildInput,
  type BewertungsWorkflowOutput as BewertungOutput,
  type PFBChapter as PfbChapter,
  type RiskFinderOutput,
} from "@spark-temporal/contracts";
import {
  type AssessmentRetainedCatalog,
  type ArgumentClassificationInput,
  type ArgumentClassificationOutput,
  type ArgumentExtractionInput,
  type ArgumentExtractionOutput,
  type ProcessDocumentsEwmsInput,
  type ProcessDocumentsEwmsOutput,
} from "./assessment-contracts.ts";

export type AssessmentRetainedKind =
  | "bewertung"
  | "ewms-documents"
  | "ewms-extraction"
  | "ewms-classification"
  | "risk";

export class AssessmentRetainedFixtureMatchError extends Error {
  constructor(
    kind: AssessmentRetainedKind,
    input:
      | BewertungsChildInput
      | ProcessDocumentsEwmsInput
      | ArgumentExtractionInput
      | ArgumentClassificationInput
      | PfbChapter,
  ) {
    super(`No exact retained ${kind} child fixture for ${JSON.stringify(input)}`);
    this.name = "AssessmentRetainedFixtureMatchError";
  }
}

export interface AssessmentRetainedBoundary {
  bewertung(input: BewertungsChildInput): Promise<BewertungOutput>;
  processDocuments(input: ProcessDocumentsEwmsInput): Promise<ProcessDocumentsEwmsOutput>;
  extractArguments(input: ArgumentExtractionInput): Promise<ArgumentExtractionOutput>;
  classifyArguments(input: ArgumentClassificationInput): Promise<ArgumentClassificationOutput>;
  risk(input: PfbChapter): Promise<RiskFinderOutput>;
}

export function createAssessmentRetainedFixture(
  value: AssessmentRetainedCatalog,
): AssessmentRetainedBoundary {
  const catalog = value;
  return {
    async bewertung(input) {
      const fixture = catalog.fixtures.find(
        (candidate) => candidate.kind === "bewertung" && isDeepStrictEqual(candidate.input, input),
      );
      if (fixture?.kind !== "bewertung") {
        throw new AssessmentRetainedFixtureMatchError("bewertung", input);
      }
      return structuredClone(fixture.output);
    },
    async processDocuments(input) {
      const fixture = catalog.fixtures.find(
        (candidate) =>
          candidate.kind === "ewms-documents" && isDeepStrictEqual(candidate.input, input),
      );
      if (fixture?.kind !== "ewms-documents") {
        throw new AssessmentRetainedFixtureMatchError("ewms-documents", input);
      }
      return structuredClone(fixture.output);
    },
    async extractArguments(input) {
      const fixture = catalog.fixtures.find(
        (candidate) =>
          candidate.kind === "ewms-extraction" && isDeepStrictEqual(candidate.input, input),
      );
      if (fixture?.kind !== "ewms-extraction") {
        throw new AssessmentRetainedFixtureMatchError("ewms-extraction", input);
      }
      return structuredClone(fixture.output);
    },
    async classifyArguments(input) {
      const fixture = catalog.fixtures.find(
        (candidate) =>
          candidate.kind === "ewms-classification" && isDeepStrictEqual(candidate.input, input),
      );
      if (fixture?.kind !== "ewms-classification") {
        throw new AssessmentRetainedFixtureMatchError("ewms-classification", input);
      }
      return structuredClone(fixture.output);
    },
    async risk(input) {
      const fixture = catalog.fixtures.find(
        (candidate) => candidate.kind === "risk" && isDeepStrictEqual(candidate.input, input),
      );
      if (fixture?.kind !== "risk") {
        throw new AssessmentRetainedFixtureMatchError("risk", input);
      }
      return structuredClone(fixture.output);
    },
  };
}
