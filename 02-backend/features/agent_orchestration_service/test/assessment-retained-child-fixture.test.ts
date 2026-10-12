import { describe, expect, test } from "bun:test";

import {
  AssessmentRetainedFixtureMatchError,
  createAssessmentRetainedFixture,
} from "../src/temporal/assessment-retained-children.ts";
import { type AssessmentRetainedCatalog } from "../src/temporal/assessment-contracts.ts";

const catalog: AssessmentRetainedCatalog = await Bun.file(
  new URL("../fixtures/assessment-retained-outcomes.json", import.meta.url),
).json();

describe("AOS assessment retained worker fixtures", () => {
  test("returns typed outcomes for every exact retained worker exit", async () => {
    const boundary = createAssessmentRetainedFixture(catalog);
    for (const retained of catalog.fixtures) {
      switch (retained.kind) {
        case "bewertung":
          expect(boundary.bewertung(retained.input)).resolves.toEqual(retained.output);
          break;
        case "ewms-documents":
          expect(boundary.processDocuments(retained.input)).resolves.toEqual(retained.output);
          break;
        case "ewms-extraction":
          expect(boundary.extractArguments(retained.input)).resolves.toEqual(retained.output);
          break;
        case "ewms-classification":
          expect(boundary.classifyArguments(retained.input)).resolves.toEqual(retained.output);
          break;
        case "risk":
          expect(boundary.risk(retained.input)).resolves.toEqual(retained.output);
          break;
      }
    }
  });

  test("fails closed for a schema-valid but non-exact retained input", async () => {
    const boundary = createAssessmentRetainedFixture(catalog);
    const retained = catalog.fixtures.find(({ kind }) => kind === "risk");
    if (retained?.kind !== "risk") throw new Error("missing risk fixture");

    expect(
      boundary.risk({
        ...retained.input,
        text: "A different valid chapter.",
      }),
    ).rejects.toBeInstanceOf(AssessmentRetainedFixtureMatchError);
  });

  test("does not match an input with undeclared fields", async () => {
    const boundary = createAssessmentRetainedFixture(catalog);
    const retained = catalog.fixtures.find(({ kind }) => kind === "bewertung");
    if (retained?.kind !== "bewertung") throw new Error("missing bewertung fixture");
    const input = { ...retained.input, incidental: true };
    expect(boundary.bewertung(input)).rejects.toBeInstanceOf(AssessmentRetainedFixtureMatchError);
  });
});
