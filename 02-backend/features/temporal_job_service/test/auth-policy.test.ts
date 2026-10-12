import { describe, expect, test } from "bun:test"
import { Type as T } from "@sinclair/typebox"

import rawPolicy from "../fixtures/auth-policy.json"
import { parseReadContract } from "./support/read-contracts"

const AuthPolicySchema = T.Object(
  {
    mode: T.Literal("disabled"),
    cases: T.Array(
      T.Object(
        {
          credentials: T.Union([T.Literal("absent"), T.Literal("malformed")]),
          expectedStatus: T.Literal(200),
        },
        { additionalProperties: false },
      ),
      { minItems: 2, maxItems: 2 },
    ),
    reason: T.String({ minLength: 1 }),
  },
  { additionalProperties: false },
)

describe("read-test auth policy", () => {
  test("keeps authorization isolation explicit and closed", () => {
    const policy = parseReadContract(AuthPolicySchema, rawPolicy)
    expect(policy.mode).toBe("disabled")
    expect(policy.cases.map(({ credentials }) => credentials).sort()).toEqual([
      "absent",
      "malformed",
    ])
  })
})
