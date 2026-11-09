import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { projects, projectVersionLocks } from "@spark-workflow/core/projects/schema";
import type { HttpJson } from "@spark-workflow/http-host";
import { createNodeVersionService } from "@spark-workflow/node-crud";
import { and, eq } from "drizzle-orm";

import { vaeNodeHistory, vaeNodes } from "../src/db/schema.ts";
import type { BeschlussContent } from "../src/schemas.ts";
import { createPostgresApp, databaseUrl } from "./support/postgres-app.ts";

const databaseTests = databaseUrl === undefined ? describe.skip : describe;

// Shared with the frontend editor test; see implementation/backend.md Handovers.
const formattedDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "bold" }], text: "Fett" },
        { type: "text", text: " und " },
        { type: "text", marks: [{ type: "italic" }], text: "kursiv" },
        { type: "text", text: " und " },
        { type: "text", marks: [{ type: "underline" }], text: "unterstrichen" },
        { type: "hardBreak" },
        { type: "text", marks: [{ type: "bold" }], text: "vor" },
        { type: "hardBreak", marks: [{ type: "bold" }] },
        { type: "text", marks: [{ type: "bold" }], text: "nach" },
      ],
    },
  ],
} satisfies BeschlussContent;
const formattedText = "Fett und kursiv und unterstrichen\nvor\nnach";

const unnormalizedDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          marks: [{ type: "underline" }, { type: "bold", attrs: { level: 1 } }],
          text: "Fe",
        },
        { type: "text", marks: [{ type: "bold" }, { type: "underline" }], text: "tt" },
        { type: "text", text: " normal", extra: true },
      ],
    },
  ],
};
const normalizedDocument = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [
        { type: "text", marks: [{ type: "bold" }, { type: "underline" }], text: "Fett" },
        { type: "text", text: " normal" },
      ],
    },
  ],
} satisfies BeschlussContent;

const paragraph = (content: readonly HttpJson[]) => ({
  type: "doc",
  content: [{ type: "paragraph", content }],
});

databaseTests("VAE nodes store formatted content and derive plain text", () => {
  const projectId = crypto.randomUUID();
  const nodeId = crypto.randomUUID();
  let harness: Awaited<ReturnType<typeof createPostgresApp>>;

  beforeAll(async () => {
    harness = await createPostgresApp(databaseUrl!);
    await harness.database.query(async (query) => {
      await query.insert(projects).values({ id: projectId, createdById: crypto.randomUUID() });
      await query.insert(vaeNodes).values({ id: nodeId, projectId, title: "Chapter", text: "Plain" });
    });
  });
  afterAll(() => harness.close([projectId]));

  const send = (method: string, path: string, body: HttpJson) =>
    harness.app.handle(
      new Request(`http://localhost${path}`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );
  const patchV2 = (payload: HttpJson) =>
    send("PATCH", `/projects/${projectId}/vae-nodes/${nodeId}?projectVersion=1`, payload);
  const insertV2 = (payload: HttpJson) =>
    send("POST", `/projects/${projectId}/vae-nodes?projectVersion=1`, payload);
  const stored = async () => {
    const [row] = await harness.database.query((query) =>
      query
        .select({ text: vaeNodes.text, content: vaeNodes.content })
        .from(vaeNodes)
        .where(eq(vaeNodes.id, nodeId)),
    );
    return row;
  };
  const rejectedLocations = async (response: Response) => {
    expect(response.status).toBe(422);
    const body = (await response.json()) as { detail: { loc: string[] }[] };
    return body.detail.map(({ loc }) => loc.join("."));
  };
  // Two runs that each pass alone but merge into one run longer than 50_000 characters.
  const longRuns = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "a".repeat(25_001) },
          { type: "text", marks: [{ type: "bold" }], text: "b".repeat(25_001) },
        ],
      },
    ],
  } satisfies BeschlussContent;
  const longMerged = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", marks: [{ type: "bold" }], text: "a".repeat(25_001) + "b".repeat(25_001) },
        ],
      },
    ],
  } satisfies BeschlussContent;

  test("a patch with formatted content stores the canonical document and the derived text", async () => {
    const response = await patchV2({ content: formattedDocument });
    expect(response.status).toBe(200);
    expect(await stored()).toEqual({ text: formattedText, content: formattedDocument });
  });

  test("a patch with an unnormalized document stores its canonical form", async () => {
    const response = await patchV2({ content: unnormalizedDocument });
    expect(response.status).toBe(200);
    expect(await stored()).toEqual({ text: "Fett normal", content: normalizedDocument });
  });

  test("the v1 update route accepts the shared document", async () => {
    const response = await send("POST", `/${projectId}/update?projectVersion=1`, {
      updates: [{ nodeType: "vae_node", id: nodeId, payload: { content: formattedDocument } }],
    });
    expect(response.status).toBe(200);
    expect(await stored()).toEqual({ text: formattedText, content: formattedDocument });
  });

  test("a patch without content leaves text unchanged", async () => {
    const storedText = async () => {
      const [row] = await harness.database.query((query) =>
        query.select({ text: vaeNodes.text }).from(vaeNodes).where(eq(vaeNodes.id, nodeId)),
      );
      return row?.text;
    };
    const before = await storedText();
    const response = await patchV2({ title: "Renamed" });
    expect(response.status).toBe(200);
    expect(await storedText()).toBe(before);
  });

  test("a patch with null content clears the content and keeps the text", async () => {
    await patchV2({ content: formattedDocument });
    const response = await patchV2({ content: null });
    expect(response.status).toBe(200);
    expect(await stored()).toEqual({ text: formattedText, content: null });
  });

  test("a patch with text is rejected", async () => {
    expect(await rejectedLocations(await patchV2({ text: "Direct" }))).toEqual(["body.text"]);
  });

  test("an insert with text and without content is rejected", async () => {
    const locations = await rejectedLocations(await insertV2({ title: "New", text: "Direct" }));
    expect(locations).toContain("body.text");
    expect(locations).toContain("body.content");
  });

  test("an insert with null content is rejected", async () => {
    expect(await rejectedLocations(await insertV2({ title: "New", content: null }))).toContain(
      "body.content",
    );
  });

  test("unsupported marks, nodes, and paragraphs are rejected by the content schema", async () => {
    for (const content of [
      paragraph([{ type: "text", marks: [{ type: "strike" }], text: "x" }]),
      paragraph([{ type: "table" }]),
      { type: "doc", content: [{ type: "paragraph" }, { type: "paragraph" }] },
    ]) {
      const locations = await rejectedLocations(await patchV2({ content }));
      expect(locations.every((location) => location.startsWith("body.content"))).toBeTrue();
    }
  });

  test("a duplicate mark is rejected by the normalization", async () => {
    const response = await patchV2({
      content: paragraph([{ type: "text", marks: [{ type: "bold" }, { type: "bold" }], text: "x" }]),
    });
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ detail: "Invalid node request" });
  });

  test("adjacent runs merge without a length cap and stay readable", async () => {
    expect((await patchV2({ content: longRuns })).status).toBe(200);
    expect(await stored()).toEqual({ text: "a".repeat(25_001) + "b".repeat(25_001), content: longMerged });
    const read = await harness.app.handle(
      new Request(`http://localhost/projects/${projectId}/vae-nodes/${nodeId}?projectVersion=1`),
    );
    expect(read.status).toBe(200);
    expect((await read.json()).content).toEqual(longMerged);
  });

  test("the history table records the formatted content", async () => {
    await patchV2({ content: formattedDocument });
    await patchV2({ title: "History marker" });
    const history = await harness.database.query((query) =>
      query
        .select({ content: vaeNodeHistory.content })
        .from(vaeNodeHistory)
        .where(eq(vaeNodeHistory.id, nodeId)),
    );
    expect(history.map(({ content }) => content)).toContainEqual(formattedDocument);
  });

  test("a project-version copy copies content and text as stored", async () => {
    await patchV2({ content: formattedDocument });
    const lockToken = crypto.randomUUID();
    await harness.database.query(async (query) => {
      await query
        .insert(projects)
        .values({ id: projectId, projectVersion: 2, createdById: crypto.randomUUID() });
      await query.insert(projectVersionLocks).values({
        id: crypto.randomUUID(),
        projectId,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken,
      });
    });
    expect(
      await createNodeVersionService(harness.nodes).copyVersion({
        projectId,
        sourceVersion: 1,
        targetVersion: 2,
        lockToken,
        nodes: [{ nodeType: "vae_node", id: nodeId }],
        dryRun: false,
      }),
    ).toEqual({ dryRun: false, copied: 1 });
    expect(
      await harness.database.query((query) =>
        query
          .select({ text: vaeNodes.text, content: vaeNodes.content })
          .from(vaeNodes)
          .where(and(eq(vaeNodes.id, nodeId), eq(vaeNodes.projectVersion, 2))),
      ),
    ).toEqual([{ text: formattedText, content: formattedDocument }]);
  });

  test("a copy override with content derives text and stores a readable canonical form", async () => {
    const lockToken = crypto.randomUUID();
    await harness.database.query(async (query) => {
      await query
        .insert(projects)
        .values({ id: projectId, projectVersion: 3, createdById: crypto.randomUUID() });
      // One active lock per project: release the lock of the previous copy test.
      await query
        .update(projectVersionLocks)
        .set({ status: "RELEASED" })
        .where(eq(projectVersionLocks.projectId, projectId));
      await query.insert(projectVersionLocks).values({
        id: crypto.randomUUID(),
        projectId,
        sourceVersion: 1,
        targetVersion: 3,
        lockToken,
      });
    });
    expect(
      await createNodeVersionService(harness.nodes).copyVersion({
        projectId,
        sourceVersion: 1,
        targetVersion: 3,
        lockToken,
        nodes: [{ nodeType: "vae_node", id: nodeId, overrides: { content: longRuns } }],
        dryRun: false,
      }),
    ).toEqual({ dryRun: false, copied: 1 });
    const read = await harness.app.handle(
      new Request(`http://localhost/projects/${projectId}/vae-nodes/${nodeId}?projectVersion=3`),
    );
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({
      text: "a".repeat(25_001) + "b".repeat(25_001),
      content: longMerged,
    });
  });
});
