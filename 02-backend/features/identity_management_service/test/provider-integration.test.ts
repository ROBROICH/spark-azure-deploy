import {describe, expect, test} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";
import { Redacted } from "effect";

import {ErrorResponse, RelationshipWriteResponse, loadIdentityMutationFixture, parseContract, } from "./support/contracts.ts";
import {loadSpiceDbRevisions} from "../src/migrations/revisions.ts";
import {SpiceDbClient} from "../src/providers/spicedb.ts";

const providerUrl = process.env.IDENTITY_FOCUSED_PROVIDER_URL;
const unavailableUrl = process.env.IDENTITY_FOCUSED_UNAVAILABLE_URL;
const primaryToken = process.env.IDENTITY_FOCUSED_PRIMARY_TOKEN;
const secondaryToken = process.env.IDENTITY_FOCUSED_SECONDARY_TOKEN;
const primaryUserId = process.env.IDENTITY_FOCUSED_PRIMARY_USER_ID;
const secondaryUserId = process.env.IDENTITY_FOCUSED_SECONDARY_USER_ID;
const projectId = process.env.IDENTITY_FOCUSED_PROJECT_ID;
const deniedProjectId = process.env.IDENTITY_FOCUSED_DENIED_PROJECT_ID;
const spiceDbEndpoint = process.env.AUTH_SPICE_DB_ENDPOINT;
const spiceDbToken = process.env.AUTH_SPICE_DB_TOKEN;
const externalTest = [
  providerUrl,
  unavailableUrl,
  primaryToken,
  secondaryToken,
  primaryUserId,
  secondaryUserId,
  projectId,
  deniedProjectId,
].every((value) => value !== undefined && value !== "")
  ? test
  : test.skip;
const semanticSchemaTest = spiceDbEndpoint && spiceDbToken ? test : test.skip;

const post = async (
  baseUrl: string,
  path: string,
  token: string,
  body: HttpJson,
): Promise<{ body: HttpJson; status: number }> => {
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return {
    body: (await response.json()) as HttpJson,
    status: response.status,
  };
};

describe("focused real Identity provider integration test", () => {
  semanticSchemaTest(
    "proves the live schema semantically equals the latest accepted revision",
    async () => {
      if (!spiceDbEndpoint || !spiceDbToken) {
        throw new Error("focused real SpiceDB schema integration test is not configured");
      }
      const revisions = await loadSpiceDbRevisions();
      const latest = revisions.at(-1);
      if (!latest) throw new Error("accepted SpiceDB revisions are missing");
      const client = new SpiceDbClient({
        endpoint: spiceDbEndpoint,
        token: Redacted.make(spiceDbToken),
        insecure: process.env.AUTH_SPICE_DB_INSECURE === "true",
        certPath: process.env.AUTH_SPICE_DB_CERT_PATH,
      });
      try {
        expect((await client.schemaMatches(latest.schema)).unwrap()).toBeTrue();
      } finally {
        client.close();
      }
    },
  );

  externalTest(
    "freezes complete assignment replacement, denial, and provider failure",
    async () => {
      if (
        !providerUrl ||
        !unavailableUrl ||
        !primaryToken ||
        !secondaryToken ||
        !primaryUserId ||
        !secondaryUserId ||
        !projectId ||
        !deniedProjectId
      ) {
        throw new Error("focused real Identity provider integration test is not configured");
      }
      const fixture = await loadIdentityMutationFixture();
      const replacements = new Map([
        ["$primaryUserId", primaryUserId],
        ["$secondaryUserId", secondaryUserId],
      ]);

      for (const scenarioId of [
        "owner-required",
        "replace-snapshot",
        "permission-denied",
        "provider-unavailable",
      ] as const) {
        const scenario = fixture.assignments.find(({ id }) => id === scenarioId);
        if (scenario === undefined)
          throw new Error(`focused assignment scenario ${scenarioId} is missing`);
        const baseUrl = scenario.profile === "focused-unavailable" ? unavailableUrl : providerUrl;
        const token = scenario.actor === "secondary" ? secondaryToken : primaryToken;
        const targetProjectId = scenario.id === "permission-denied" ? deniedProjectId : projectId;
        const result = await post(
          baseUrl,
          `/assign/projects/${targetProjectId}/assignments`,
          token,
          {
            assignments: scenario.request.assignments.map((assignment) => ({
              ...assignment,
              userId: replacements.get(assignment.userId) ?? assignment.userId,
            })),
          },
        );

        expect(result.status).toBe(scenario.expected.status);
        if (result.status === 200) {
          expect(parseContract(RelationshipWriteResponse, result.body)).toEqual(
            parseContract(RelationshipWriteResponse, scenario.expected.body),
          );
        } else {
          expect(parseContract(ErrorResponse, result.body)).toEqual(
            parseContract(ErrorResponse, scenario.expected.body),
          );
        }
      }
    },
  );
});
