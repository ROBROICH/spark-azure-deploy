import { describe, expect } from "bun:test";

import {
  CommentListSchema,
  ValidationErrorResponseSchema,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

const route = (projectId: string, query = "") =>
  `/projects/${projectId}/comments${query ? `?${query}` : ""}`;

async function comments(projectId: string, query = "") {
  const response = await readJson(route(projectId, query));
  const body = parseReadContract(CommentListSchema, response.body);
  return {
    status: response.status,
    body: body.map((comment) => ({
      ...comment,
      createdAt: new Date(comment.createdAt).toISOString(),
      updatedAt: new Date(comment.updatedAt).toISOString(),
    })),
  };
}

describe("GET /projects/{project_id}/comments HTTP contract", () => {
  externalTest("snapshots the complete populated project in stable creation order", async () => {
    const response = await comments(readScenarios.projects.populated);

    expect(response.body.map((comment) => comment.id)).toEqual(readScenarios.comments.ordered);
    expect(response.body.map((comment) => comment.id)).not.toContain(
      readScenarios.comments.otherProject,
    );
    expect(response.body.some((comment) => comment.sourceRef === null)).toBe(true);
    expect(response.body.some((comment) => comment.sourceRef !== null)).toBe(true);
    expect(response).toMatchSnapshot();
  });

  externalTest("snapshots an explicit empty project", async () => {
    expect(await comments(readScenarios.projects.empty)).toMatchSnapshot();
  });

  externalTest("snapshots matching and nonmatching process-step filters", async () => {
    expect(
      await comments(readScenarios.projects.populated, "process_step=legalReview"),
    ).toMatchSnapshot("matching process step");
    expect(
      await comments(readScenarios.projects.populated, "process_step=materialCompletenessCheck"),
    ).toMatchSnapshot("nonmatching process step");
  });

  externalTest("snapshots matching and nonmatching source-type filters", async () => {
    expect(
      await comments(readScenarios.projects.populated, "source_type=materialSatz"),
    ).toMatchSnapshot("matching source type");
    expect(await comments(readScenarios.projects.populated, "source_type=manual")).toMatchSnapshot(
      "nonmatching source type",
    );
  });

  externalTest("snapshots matching and nonmatching combined filters", async () => {
    expect(
      await comments(
        readScenarios.projects.populated,
        "process_step=legalReview&source_type=materialSatz",
      ),
    ).toMatchSnapshot("matching combined filters");
    expect(
      await comments(
        readScenarios.projects.populated,
        "process_step=legalReview&source_type=materialNorm",
      ),
    ).toMatchSnapshot("nonmatching combined filters");
  });

  externalTest("snapshots repeated process-step values as an OR filter", async () => {
    expect(
      await comments(
        readScenarios.projects.populated,
        "process_step=legalReview&process_step=unsorted",
      ),
    ).toMatchSnapshot();
  });

  externalTest("snapshots first, middle, and empty pagination windows", async () => {
    expect(await comments(readScenarios.projects.populated, "limit=1&offset=0")).toMatchSnapshot(
      "first page",
    );
    expect(await comments(readScenarios.projects.populated, "limit=1&offset=1")).toMatchSnapshot(
      "middle page",
    );
    expect(await comments(readScenarios.projects.populated, "limit=2&offset=99")).toMatchSnapshot(
      "empty page",
    );
  });

  externalTest("snapshots accepted limit and offset boundaries", async () => {
    expect(await comments(readScenarios.projects.populated, "limit=1")).toMatchSnapshot(
      "minimum limit",
    );
    expect(await comments(readScenarios.projects.populated, "limit=200")).toMatchSnapshot(
      "maximum limit",
    );
    expect(await comments(readScenarios.projects.populated, "offset=0")).toMatchSnapshot(
      "minimum offset",
    );
  });

  const invalidQueries = [
    ["limit below minimum", "limit=0"],
    ["limit above maximum", "limit=201"],
    ["negative offset", "offset=-1"],
    ["invalid process step", "process_step=unknown"],
    ["invalid source type", "source_type=unknown"],
  ] as const;

  for (const [name, query] of invalidQueries) {
    externalTest(`snapshots ${name}`, async () => {
      const response = await readJson(route(readScenarios.projects.populated, query));
      const body = parseReadContract(ValidationErrorResponseSchema, response.body);
      expect(response.status).toBe(422);
      expect(body.detail).not.toHaveLength(0);
    });
  }
});
