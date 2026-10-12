import { describe, expect, test } from "bun:test";

import { ErrorResponseSchema, parseReadContract } from "./support/read-contracts.ts";

describe("strict Examination TypeBox response parsing", () => {
  test("returns only the declared error response fields", () => {
    expect(parseReadContract(ErrorResponseSchema, { detail: "expected", extra: true })).toEqual({
      detail: "expected",
    });
  });
});
