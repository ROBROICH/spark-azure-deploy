import { describe, expect, test } from "bun:test";
import { Value } from "@sinclair/typebox/value";

import { UpdateProjectTypeSchema } from "../src/schemas.ts";

const id = "00000000-0000-4000-8000-000000000010";

describe("PATCH /project-types body", () => {
  test("accepts the incumbent {id,name} body and an explicit active flag", () => {
    expect(Value.Check(UpdateProjectTypeSchema, { id, name: "Fernstraße" })).toBe(true);
    expect(
      Value.Check(UpdateProjectTypeSchema, { id, name: "Fernstraße", active: false }),
    ).toBe(true);
    expect(Value.Check(UpdateProjectTypeSchema, { id, name: "Fernstraße", active: true })).toBe(
      true,
    );
  });

  test("rejects a missing name", () => {
    expect(Value.Check(UpdateProjectTypeSchema, { id, active: false })).toBe(false);
  });
});
