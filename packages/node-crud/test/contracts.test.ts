import { describe, expect, test } from "bun:test";

import { buildNodeContracts } from "../src";
import { representativeNodes } from "./fixtures/representative-app/schema";

describe("node invariant contracts", () => {
  test("builds deterministic closed discriminated unions", () => {
    const contracts = buildNodeContracts({ name: "representative", nodes: representativeNodes });
    const models = contracts.openApiModels as Record<
      string,
      { properties?: { nodeType?: { enum?: string[] } } }
    >;
    expect(models.V1RepresentativeAuthorNodeResponse?.properties?.nodeType?.enum).toEqual([
      "author",
    ]);
  });
});
