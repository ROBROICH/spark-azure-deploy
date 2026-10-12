import {describe, expect, test} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";

import {ErrorResponse, loadIdentityMutationFixture, parseContract, } from "./support/contracts.ts";

const bulkUrl = process.env.IDENTITY_MUTATION_BULK_URL;

const bulkExternalTest = bulkUrl ? test : test.skip;

const requestJson = async (
  baseUrl: string,
  path: string,
  body: HttpJson,
  token?: string,
): Promise<{ body: HttpJson; status: number }> => {
  const headers = new Headers({ "content-type": "application/json" });
  if (token !== undefined) headers.set("authorization", `Bearer ${token}`);
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  return {
    body: (await response.json()) as HttpJson,
    status: response.status,
  };
};

describe("POST /assign/projects/{project_id}/assignments", () => {
  bulkExternalTest(
    "fails closed before any SpiceDB construction in bulk fixture mode",
    async () => {
      if (!bulkUrl) throw new Error("bulk Identity mutation fixture is not configured");
      const fixture = await loadIdentityMutationFixture();
      const scenario = fixture.assignments.find(({ id }) => id === "bulk-spicedb-disabled");
      if (scenario === undefined) throw new Error("bulk assignment scenario is missing");

      const result = await requestJson(
        bulkUrl,
        "/assign/projects/fixture-project/assignments",
        scenario.request,
      );

      expect(result.status).toBe(scenario.expected.status);
      expect(parseContract(ErrorResponse, result.body)).toEqual(
        parseContract(ErrorResponse, scenario.expected.body),
      );
    },
  );
});
