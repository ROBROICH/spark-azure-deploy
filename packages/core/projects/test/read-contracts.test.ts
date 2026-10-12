import { describe, expect, test } from "bun:test";

import { parseReadContract, ProjectTypesSchema } from "./support/read-contracts.ts";

describe("parseReadContract", () => {
  test("returns only declared response properties", () => {
    const response = [
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Example",
        active: true,
        undeclared: true,
      },
    ];

    expect(parseReadContract(ProjectTypesSchema, response)).toEqual([
      {
        id: "11111111-1111-1111-1111-111111111111",
        name: "Example",
        active: true,
      },
    ]);
  });
});
