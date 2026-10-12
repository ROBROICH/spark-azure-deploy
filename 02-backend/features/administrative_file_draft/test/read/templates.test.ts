import { describe, expect } from "bun:test";

import {
  ErrorResponseSchema,
  TemplateListSchema,
  TemplateNodeListSchema,
  TemplateSchema,
  parseReadContract,
} from "../support/read-contracts.ts";
import { externalTest, readJson } from "../support/external-app.ts";
import { readScenarios } from "../support/read-scenarios.ts";

describe("Administrative File Draft template read contract", () => {
  externalTest("GET /templates snapshots the retained Testing template", async () => {
    const response = await readJson(
      `/templates?project_type_id=${readScenarios.projectTypes.populated}`,
    );
    const body = parseReadContract(TemplateListSchema, response.body);

    expect(body.map((template) => template.id)).toEqual([readScenarios.templates.active]);
    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("GET /templates snapshots an empty project type", async () => {
    const response = await readJson(
      `/templates?project_type_id=${readScenarios.projectTypes.empty}`,
    );
    const body = parseReadContract(TemplateListSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("GET /templates/{template_id} snapshots a found template", async () => {
    const response = await readJson(`/templates/${readScenarios.templates.active}`);
    const body = parseReadContract(TemplateSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });

  externalTest("GET /templates/{template_id} reports an unknown id", async () => {
    const response = await readJson(`/templates/${readScenarios.templates.unknown}`);
    parseReadContract(ErrorResponseSchema, response.body);

    expect(response.status).toBe(500);
  });

  externalTest(
    "GET /templates/{template_id}/nodes snapshots roots, children, and order",
    async () => {
      const response = await readJson(`/templates/${readScenarios.templates.active}/nodes`);
      const body = parseReadContract(TemplateNodeListSchema, response.body);
      for (const node of body) {
        node.createdAt = new Date(node.createdAt).toISOString();
        node.updatedAt = new Date(node.updatedAt).toISOString();
        node.sysPeriod.lower = new Date(node.sysPeriod.lower).toISOString();
        if (node.sysPeriod.upper)
          node.sysPeriod.upper = new Date(node.sysPeriod.upper).toISOString();
      }

      expect(body.some((node) => node.parentVaeNodeId !== null)).toBe(true);
      expect({ status: response.status, body }).toMatchSnapshot();
    },
  );

  externalTest("GET /templates/{template_id}/nodes snapshots an unknown template", async () => {
    const response = await readJson(`/templates/${readScenarios.templates.unknown}/nodes`);
    const body = parseReadContract(TemplateNodeListSchema, response.body);

    expect({ status: response.status, body }).toMatchSnapshot();
  });
});
