import { describe, expect, test } from "bun:test";

import { type RetainedChildCatalog } from "../src/temporal/norm-contracts.ts";
import {
  RetainedChildFixtureMatchError,
  createRetainedChildFixture,
} from "../src/temporal/retained-children.ts";

const catalog: RetainedChildCatalog = await Bun.file(
  new URL("../fixtures/retained-child-outcomes.json", import.meta.url),
).json();

describe("AOS retained child application fixtures", () => {
  test("returns typed outcomes only for exact Rechtsmethodik and Satz inputs", async () => {
    const boundary = createRetainedChildFixture(catalog);
    const rechtsmethodik = catalog.fixtures.find(({ kind }) => kind === "rechtsmethodik");
    const satz = catalog.fixtures.find(({ kind }) => kind === "satz");
    if (rechtsmethodik?.kind !== "rechtsmethodik")
      throw new Error("missing rechtsmethodik fixture");
    if (satz?.kind !== "satz") throw new Error("missing satz fixture");

    expect(boundary.rechtsmethodik(rechtsmethodik.input)).resolves.toEqual(rechtsmethodik.output);
    expect(boundary.satz(satz.input)).resolves.toEqual(satz.output);
  });

  test("fails closed on a schema-valid but non-exact child input", async () => {
    const boundary = createRetainedChildFixture(catalog);
    const retained = catalog.fixtures.find(({ kind }) => kind === "rechtsmethodik");
    if (retained?.kind !== "rechtsmethodik") throw new Error("missing rechtsmethodik fixture");

    expect(
      boundary.rechtsmethodik({ ...retained.input, paragraphNr: "45" }),
    ).rejects.toBeInstanceOf(RetainedChildFixtureMatchError);
  });

  test("does not match an input with undeclared fields", async () => {
    const boundary = createRetainedChildFixture(catalog);
    const retained = catalog.fixtures.find(({ kind }) => kind === "satz");
    if (retained?.kind !== "satz") throw new Error("missing satz fixture");
    const input = { ...retained.input, incidental: true };
    expect(boundary.satz(input)).rejects.toBeInstanceOf(RetainedChildFixtureMatchError);
  });
});
