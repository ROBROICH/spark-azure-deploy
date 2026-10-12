import { describe, expect } from "bun:test";

import {
  ErrorResponseSchema,
  parseReadContract,
  SupplementaryRequestListSchema,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

type QueryValue = boolean | number | string | readonly string[];

function listPath(projectId: string, query: Record<string, QueryValue> = {}): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) search.append(name, item);
    } else {
      search.set(name, String(value));
    }
  }
  return `/projects/${projectId}/supplementary-requests${search.size ? `?${search}` : ""}`;
}

async function list(projectId: string, query: Record<string, QueryValue> = {}) {
  const response = await readJson(listPath(projectId, query));
  return {
    status: response.status,
    body: parseReadContract(SupplementaryRequestListSchema, response.body),
  };
}

async function listError(projectId: string, query: Record<string, QueryValue> = {}) {
  const response = await readJson(listPath(projectId, query));
  return {
    status: response.status,
    body: parseReadContract(ErrorResponseSchema, response.body),
  };
}

const populated = readScenarios["populated-project-v1"];
const empty = readScenarios["empty-project-v1"];
const other = readScenarios["other-project-v1"];
const ids = (result: Awaited<ReturnType<typeof list>>) => result.body.map((request) => request.id);

describe("GET /projects/{project_id}/supplementary-requests HTTP contract", () => {
  externalTest("snapshots empty and project-isolated collections", async () => {
    const [emptyResult, populatedResult, otherResult] = await Promise.all([
      list(empty.projectId),
      list(populated.projectId),
      list(other.projectId),
    ]);

    expect(emptyResult.status).toBe(200);
    expect(emptyResult.body).toEqual([]);
    expect(ids(populatedResult)).not.toContain(other.requests[0]!.id);
    expect(ids(otherResult)).toEqual([other.requests[0]!.id]);
    expect({ empty: emptyResult, otherProject: otherResult }).toMatchSnapshot();
  });

  externalTest("snapshots the complete populated payload in default creation order", async () => {
    const result = await list(populated.projectId);

    expect(result.status).toBe(200);
    expect(ids(result)).toEqual(populated.requests.map((request) => request.id));
    expect(result.body.some((request) => request.sourceRef === null)).toBe(true);
    expect(result.body.some((request) => request.sourceRef !== null)).toBe(true);
    expect(result).toMatchSnapshot();
  });

  externalTest("snapshots single, repeated, and nonmatching source filters", async () => {
    const [single, multiple, nonmatching] = await Promise.all([
      list(populated.projectId, { sourceType: "requiredDocuments" }),
      list(populated.projectId, {
        sourceType: ["tableOfContents", "requiredDocuments"],
      }),
      list(populated.projectId, { sourceType: "materialNorm" }),
    ]);

    expect(ids(single)).toEqual([populated.requests[4]!.id]);
    expect(ids(multiple)).toEqual([
      populated.requests[0]!.id,
      populated.requests[1]!.id,
      populated.requests[4]!.id,
    ]);
    expect(nonmatching.body).toEqual([]);
    expect({ single, multiple, nonmatching }).toMatchSnapshot();
  });

  externalTest(
    "snapshots inclusion filters alone and combined with repeated source filters",
    async () => {
      const [included, excluded, combined] = await Promise.all([
        list(populated.projectId, { includedInLetter: true }),
        list(populated.projectId, { includedInLetter: false }),
        list(populated.projectId, {
          sourceType: ["tableOfContents", "requiredDocuments"],
          includedInLetter: false,
        }),
      ]);

      expect(ids(included)).toEqual([
        populated.requests[0]!.id,
        populated.requests[2]!.id,
        populated.requests[3]!.id,
        populated.requests[4]!.id,
      ]);
      expect(ids(excluded)).toEqual([populated.requests[1]!.id]);
      expect(ids(combined)).toEqual([populated.requests[1]!.id]);
      expect({ included, excluded, combined }).toMatchSnapshot();
    },
  );

  externalTest("snapshots every supported explicit sort and the default", async () => {
    const [defaultOrder, createdAsc, createdDesc, updatedAsc, updatedDesc] = await Promise.all([
      list(populated.projectId),
      list(populated.projectId, { sort: "created_at:asc" }),
      list(populated.projectId, { sort: "created_at:desc" }),
      list(populated.projectId, { sort: "updated_at:asc" }),
      list(populated.projectId, { sort: "updated_at:desc" }),
    ]);

    expect(ids(defaultOrder)).toEqual(ids(createdAsc));
    expect(ids(createdDesc)).toEqual([...ids(createdAsc)].reverse());
    expect(ids(updatedAsc)).toEqual([
      populated.requests[0]!.id,
      populated.requests[4]!.id,
      populated.requests[1]!.id,
      populated.requests[3]!.id,
      populated.requests[2]!.id,
    ]);
    expect(ids(updatedDesc)).toEqual([...ids(updatedAsc)].reverse());
    expect({ defaultOrder, createdAsc, createdDesc, updatedAsc, updatedDesc }).toMatchSnapshot();
  });

  externalTest("snapshots first, middle, empty, and limit/offset boundary slices", async () => {
    const [first, middle, emptySlice, minimumLimit, maximumLimit, zeroOffset] = await Promise.all([
      list(populated.projectId, { limit: 2, offset: 0 }),
      list(populated.projectId, { limit: 2, offset: 2 }),
      list(populated.projectId, { limit: 2, offset: 5 }),
      list(populated.projectId, { limit: 1 }),
      list(populated.projectId, { limit: 200 }),
      list(populated.projectId, { offset: 0 }),
    ]);

    expect(ids(first)).toEqual(populated.requests.slice(0, 2).map((request) => request.id));
    expect(ids(middle)).toEqual(populated.requests.slice(2, 4).map((request) => request.id));
    expect(emptySlice.body).toEqual([]);
    expect(ids(minimumLimit)).toEqual([populated.requests[0]!.id]);
    expect(ids(maximumLimit)).toEqual(populated.requests.map((request) => request.id));
    expect(ids(zeroOffset)).toEqual(populated.requests.map((request) => request.id));
    expect({ first, middle, emptySlice, minimumLimit, maximumLimit, zeroOffset }).toMatchSnapshot();
  });

  externalTest("snapshots invalid source, boolean, and project identifier values", async () => {
    const [source, booleanValue, projectId] = await Promise.all([
      listError(populated.projectId, { sourceType: "not-a-source" }),
      listError(populated.projectId, { includedInLetter: "not-a-boolean" }),
      listError("not-a-project-id"),
    ]);

    expect(source.status).toBe(422);
    expect(booleanValue.status).toBe(422);
    expect(projectId.status).toBe(422);
    for (const response of [source, booleanValue, projectId]) {
      if (Array.isArray(response.body.detail)) {
        expect(response.body.detail).not.toHaveLength(0);
      } else {
        expect(response.body.detail).toBe("Invalid request payload");
      }
    }
  });

  externalTest("snapshots every invalid sort family", async () => {
    const [field, direction, missingDirection] = await Promise.all([
      listError(populated.projectId, { sort: "title:asc" }),
      listError(populated.projectId, { sort: "created_at:sideways" }),
      listError(populated.projectId, { sort: "created_at" }),
    ]);

    expect(field.status).toBe(400);
    expect(direction.status).toBe(400);
    expect(missingDirection.status).toBe(400);
    expect({ field, direction, missingDirection }).toMatchSnapshot();
  });

  externalTest("snapshots invalid pagination boundaries and types", async () => {
    const [zeroLimit, overLimit, negativeOffset, invalidLimit] = await Promise.all([
      listError(populated.projectId, { limit: 0 }),
      listError(populated.projectId, { limit: 201 }),
      listError(populated.projectId, { offset: -1 }),
      listError(populated.projectId, { limit: "not-an-integer" }),
    ]);

    expect(zeroLimit.status).toBe(422);
    expect(overLimit.status).toBe(422);
    expect(negativeOffset.status).toBe(422);
    expect(invalidLimit.status).toBe(422);
    for (const response of [zeroLimit, overLimit, negativeOffset, invalidLimit]) {
      if (Array.isArray(response.body.detail)) {
        expect(response.body.detail).not.toHaveLength(0);
      } else {
        expect(response.body.detail).toBe("Invalid request payload");
      }
    }
  });
});
