import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import type { Static } from "@sinclair/typebox";

import {
  ContradictionOccurrenceSchema,
  ContradictionSchema,
  PlausibilityCheckResultSchema,
  PlausibilityResultFileSchema,
} from "../src/schemas.ts";

import moduleResult from "../fixtures/module-result-sample.json";

/**
 * Contract between the plausibility module and this service: the aggregated result file
 * the module uploads to the DMS (camelCase via the module's field aliases, with the
 * confidence layer) must pass the strict job-done validation unchanged.
 *
 * The fixture is a real module output (synthetic dataset B 999n, 12 of 73 entries).
 */
describe("plausibility module result file contract", () => {
  test("the module's aggregated result file passes the job-done schema", () => {
    const errors = [...Value.Errors(PlausibilityResultFileSchema, moduleResult)];
    expect(errors.map((e) => `${e.path}: ${e.message}`)).toEqual([]);
    expect(Value.Check(PlausibilityResultFileSchema, moduleResult)).toBe(true);
  });

  test("the confidence layer is present on every entry", () => {
    for (const entry of moduleResult.contradictions) {
      expect(entry.confidenceScore).toBeTypeOf("number");
      expect(entry.scoreA).toBeTypeOf("number");
      expect(entry.scoreB).toBeTypeOf("number");
      expect(entry.mergedCount).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(entry.evidence)).toBe(true);
    }
  });

  test("a legacy result file without the confidence layer still passes", () => {
    const legacy = {
      contradictions: moduleResult.contradictions.map(
        ({ id, title, description, rating, status, occurrences }) => ({
          id,
          title,
          description,
          rating,
          status,
          occurrences: occurrences.map(
            ({ documentId, documentName, contentExcerpt, pageNumber }) => ({
              documentId,
              documentName,
              contentExcerpt,
              pageNumber,
            }),
          ),
        }),
      ),
    };
    expect(Value.Check(PlausibilityResultFileSchema, legacy)).toBe(true);
  });

  const [entry] = moduleResult.contradictions;
  const [occurrence] = entry!.occurrences;
  const withEntry = (overrides: Partial<Static<typeof ContradictionSchema>>, count = 1) => ({
    contradictions: Array.from({ length: count }, () => ({ ...entry, ...overrides })),
  });
  const withOccurrence = (overrides: Partial<Static<typeof ContradictionOccurrenceSchema>>) =>
    withEntry({ occurrences: [{ ...occurrence, ...overrides }] });

  test.each([
    ["contradictions", 1_000, (size: number) => withEntry({}, size)],
    ["occurrences", 1_000, (size: number) => withEntry({ occurrences: Array(size).fill(occurrence) })],
    ["evidence items", 1_000, (size: number) => withEntry({ evidence: Array(size).fill("Beleg") })],
    ["evidence text", 50_000, (size: number) => withEntry({ evidence: ["e".repeat(size)] })],
    ["description", 50_000, (size: number) => withEntry({ description: "d".repeat(size) })],
    ["title", 1_000, (size: number) => withEntry({ title: "t".repeat(size) })],
    ["content excerpt", 50_000, (size: number) => withOccurrence({ contentExcerpt: "x".repeat(size) })],
    ["document name", 1_000, (size: number) => withOccurrence({ documentName: "n".repeat(size) })],
  ] as const)("%s budget admits the limit, rejects one more, and still reads it back", (_, limit, result) => {
    expect(Value.Check(PlausibilityResultFileSchema, result(limit))).toBe(true);
    expect(Value.Check(PlausibilityResultFileSchema, result(limit + 1))).toBe(false);
    expect(Value.Check(PlausibilityCheckResultSchema, result(limit + 1))).toBe(true);
  });
});
