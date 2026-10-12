import { afterEach, describe, expect, expectTypeOf, test } from "bun:test";
import { Result } from "better-result";
import { getTableConfig, type AnyPgTable } from "drizzle-orm/pg-core";
import { EvlogError } from "evlog";

import fixture from "../fixtures/canonical-export.json";
import deepTreeFixture from "../fixtures/deep-tree-export.json";
import { risks, vaeNodes } from "../src/db/schema";
import { generateDocx } from "../src/document/docx";
import { buildExportTree } from "../src/document/tree";
import { UnoConverter } from "../src/document/uno";
import {
  administrativeFileDraftDescriptor,
  authorizeAdministrativeFileDraftFields,
} from "../src/node/descriptor";
import { TOPICS, topicFromDatabase, topicToDatabase } from "../src/topics";
import { inspectDocx } from "./support/documents";

const servers: Bun.Server<unknown>[] = [];
const nodeSchemas = administrativeFileDraftDescriptor.nodes.map(({ schemas }) => schemas);

type IsOptional<Row, Key extends keyof Row> = {} extends Pick<Row, Key> ? true : false;
const databaseDefaultColumnsAreOptional: [
  IsOptional<typeof risks.$inferInsert, "sysPeriod">,
  IsOptional<typeof vaeNodes.$inferInsert, "sysPeriod">,
] = [true, true];

const indexMetadata = (table: AnyPgTable) =>
  getTableConfig(table)
    .indexes.map(({ config }) => ({
      name: config.name,
      columns: config.columns.map((column) => ("name" in column ? column.name : null)),
      unique: config.unique,
      partial: config.where !== undefined,
    }))
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));

afterEach(async () => {
  for (const server of servers.splice(0)) await server.stop(true);
});

describe("Administrative File Draft TypeScript runtime", () => {
  test("requires an explicit status when inserting a risk", () => {
    expectTypeOf<IsOptional<typeof risks.$inferInsert, "status">>().toEqualTypeOf<false>();
    expectTypeOf<typeof risks.$inferInsert.status>().toEqualTypeOf<
      "OPEN" | "CORRECTED" | "IGNORED"
    >();
  });

  test("keeps database-owned and server-owned node fields out of TypeBox requests", () => {
    const excluded = [
      "id",
      "projectId",
      "projectVersion",
      "createdAt",
      "updatedAt",
      "isDeleted",
      "sysPeriod",
    ];
    for (const schema of nodeSchemas.map(({ insert }) => insert)) {
      expect(Object.keys(schema.properties)).not.toEqual(expect.arrayContaining(excluded));
      expect(schema.required ?? []).not.toEqual(expect.arrayContaining(excluded));
    }

    expect(databaseDefaultColumnsAreOptional).toEqual([true, true]);
  });

  test("maps the domain indexes and risk check into Drizzle metadata", () => {
    expect(indexMetadata(risks)).toEqual([
      {
        name: "ix_risk_vae_node_id",
        columns: ["vae_node_id"],
        unique: false,
        partial: false,
      },
      {
        name: "ix_risks_project_id",
        columns: ["project_id"],
        unique: false,
        partial: false,
      },
      {
        name: "ix_risks_project_id_active",
        columns: ["project_id", "project_version"],
        unique: false,
        partial: true,
      },
    ]);
    expect(getTableConfig(risks).checks.map(({ name }) => name)).toEqual([
      "ck_risks_severity_range",
    ]);
    expect(indexMetadata(vaeNodes)).toEqual([
      {
        name: "ix_vae_node_parent",
        columns: ["parent_vae_node_id"],
        unique: false,
        partial: false,
      },
      {
        name: "ix_vae_node_parent_order",
        columns: ["parent_vae_node_id", "order"],
        unique: false,
        partial: false,
      },
      {
        name: "ix_vae_node_project_id",
        columns: ["project_id"],
        unique: false,
        partial: false,
      },
      {
        name: "ix_vae_node_project_id_active",
        columns: ["project_id", "project_version"],
        unique: false,
        partial: true,
      },
      {
        name: "ix_vae_node_subtopic_id",
        columns: ["subtopic_id"],
        unique: false,
        partial: false,
      },
      {
        name: "ix_vae_node_template",
        columns: ["template_id"],
        unique: false,
        partial: false,
      },
      {
        name: "ix_vae_node_topic_id",
        columns: ["topic_id"],
        unique: false,
        partial: false,
      },
    ]);
  });

  test("stores catalog topic display names", () => {
    expect(topicToDatabase("Nebenbestimmungen")).toBe("Nebenbestimmungen");
    expect(topicToDatabase("GEGENSTAND_VORHABEN")).toBe(TOPICS.GEGENSTAND_VORHABEN);
    expect(topicFromDatabase("GEGENSTAND_VORHABEN")).toBe(TOPICS.GEGENSTAND_VORHABEN);
    expect(topicFromDatabase("Nebenbestimmungen")).toBe("Nebenbestimmungen");
    expect(topicFromDatabase(null)).toBeNull();
    try {
      topicToDatabase("not-a-topic");
      throw new Error("expected unknown topic to fail");
    } catch (error) {
      expect(EvlogError.isEvlogError(error)).toBe(true);
      if (EvlogError.isEvlogError(error)) expect(error.status).toBe(422);
    }
  });

  test("generates semantic OOXML directly in TypeScript", async () => {
    const bytes = await generateDocx(
      fixture.nodes.map((node) => ({
        id: node.id,
        parentVaeNodeId: node.parentVaeNodeId,
        title: node.title,
        text: node.text,
        order: node.order,
        isHidden: node.isHidden,
        isDeleted: node.isDeleted,
      })),
      fixture.project.name,
      fixture.project.internalProjectNumber,
    );
    const document = await inspectDocx(bytes, {
      bodyParagraphCount: fixture.document.orderedBody.length,
    });

    expect(document.bodySuffix).toEqual(fixture.document.orderedBody);
    expect(document.bodyHeadingLevels).toEqual([1, 2]);
    expect(document.remainingSystemPlaceholders).toEqual([]);
    expect(document.containsBodyAnchor).toBeFalse();
    expect(document.updateFieldsOnOpen).toBeTrue();
  });

  test("caps deeply nested Word headings at level nine", async () => {
    const bytes = await generateDocx(
      deepTreeFixture.nodes.map((node) => ({
        id: node.id,
        parentVaeNodeId: node.parentVaeNodeId,
        title: node.title,
        text: node.text,
        order: node.order,
        isHidden: node.isHidden,
        isDeleted: node.isDeleted,
      })),
      deepTreeFixture.project.name,
      deepTreeFixture.project.internalProjectNumber,
    );
    const document = await inspectDocx(bytes, {
      bodyParagraphCount: deepTreeFixture.nodes.length,
    });

    expect(document.bodySuffix).toEqual(deepTreeFixture.nodes.map((node) => node.title));
    expect(document.bodyHeadingLevels).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 9]);
  });

  test("preserves literal metadata and resolves original chapter markers once", async () => {
    const name = "Project [Aktenzeichen] $` $' $$ $& <&>";
    const reference = "REF [vorhaben_name]";
    const bytes = await generateDocx(
      [
        {
          id: "root",
          parentVaeNodeId: null,
          title: "[vorhaben_name]",
          text: "[Aktenzeichen]\n[unknown]",
          order: 0,
          isHidden: false,
          isDeleted: false,
        },
      ],
      name,
      reference,
    );
    const document = await inspectDocx(bytes, { bodyParagraphCount: 3 });
    expect(document.bodySuffix).toEqual([name, reference, "[unknown]"]);
    expect(document.allText).toContain(name);
    expect(document.allText).toContain(reference);
  });

  test("rejects exports that would omit a cyclic component", async () => {
    const nodes = [
      { id: "a", parentVaeNodeId: "b" },
      { id: "b", parentVaeNodeId: "a" },
      { id: "child", parentVaeNodeId: "a" },
      { id: "root", parentVaeNodeId: null },
    ].map((node) => ({
      ...node,
      title: node.id,
      text: "",
      order: 0,
      isHidden: false,
      isDeleted: false,
    }));
    await expect(generateDocx(nodes, "Project", "Reference")).rejects.toMatchObject({
      status: 409,
    });
    await expect(generateDocx(nodes.slice(0, 3), "Project", "Reference")).rejects.toMatchObject({
      status: 409,
    });
    expect(buildExportTree([{ ...nodes[0]!, parentVaeNodeId: "a" }]).map(({ id }) => id)).toEqual([
      "a",
    ]);
  });

  test("promotes visible children of filtered parents and parses PostgreSQL ranges", () => {
    const tree = buildExportTree([
      {
        id: "hidden",
        parentVaeNodeId: null,
        title: "hidden",
        text: "",
        order: 1,
        isHidden: true,
        isDeleted: false,
      },
      {
        id: "visible-child",
        parentVaeNodeId: "hidden",
        title: "visible",
        text: "",
        order: 2,
        isHidden: false,
        isDeleted: false,
      },
    ]);
    expect(tree.map(({ id }) => id)).toEqual(["visible-child"]);
  });

  test("uses canonical resolved project permissions for restricted node fields", async () => {
    type Request = Parameters<typeof authorizeAdministrativeFileDraftFields>[0];
    const captured: unknown[] = [];
    const request: Request = {
      auth: {
        user: { sub: "00000000-0000-4000-8000-000000000042" },
        async authorize(checks, options) {
          captured.push({ checks, options });
          return Result.ok(undefined);
        },
      },
      projectId: "00000000-0000-4000-8000-000000000043",
      checks: [
        {
          action: "update" as const,
          nodeType: "vae_node",
          field: "text",
          permissions: ["update" as const],
          value: "replacement",
        },
        {
          action: "update" as const,
          nodeType: "vae_node",
          field: "checked_by_leader",
          permissions: ["approve" as const],
          value: true,
        },
      ],
    };

    await authorizeAdministrativeFileDraftFields(request);
    expect(captured).toEqual([
      {
        checks: [
          { resource: "project", resourceId: request.projectId, permission: "update" },
          { resource: "project", resourceId: request.projectId, permission: "approve" },
        ],
        options: { bypassRoles: ["admin", "service"] },
      },
    ]);
  });

  test("uses the narrow UNO XML-RPC conversion boundary", async () => {
    const bodies: string[] = [];
    const output = new Uint8Array([9, 8, 7]);
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        bodies.push(await request.text());
        return new Response(
          `<?xml version="1.0"?><methodResponse><params><param><value><base64>${output.toBase64()}</base64></value></param></params></methodResponse>`,
          { headers: { "content-type": "text/xml" } },
        );
      },
    });
    servers.push(server);

    const converter = new UnoConverter("127.0.0.1", server.port!, "http", 1_000);
    expect(await converter.convert(new Uint8Array([1, 2, 3]), "pdf")).toEqual(output);
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toContain("<methodName>info</methodName>");
    expect(bodies[1]).toContain("<methodName>convert</methodName>");
    expect(bodies[1]).toContain("<string>pdf</string>");
    expect(bodies[1]).toContain("<base64>AQID</base64>");
  });
});
