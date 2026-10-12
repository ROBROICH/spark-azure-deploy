import { describe, expect, test } from "bun:test"

import { outcomeCatalog } from "./support/outcome-catalog"

describe("application-facing Temporal outcome catalog", () => {
  test("keeps exact-input fixture resolution unambiguous", () => {
    const fixturesByInput = new Map<string, string>()
    for (const fixture of outcomeCatalog.fixtures) {
      const key = `${fixture.operation}:${JSON.stringify(fixture.input)}`
      expect(fixturesByInput.get(key)).toBeUndefined()
      fixturesByInput.set(key, fixture.name)
    }

  })

})
