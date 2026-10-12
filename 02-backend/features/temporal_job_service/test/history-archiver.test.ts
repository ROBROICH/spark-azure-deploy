import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { createDecipheriv } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { Redacted } from "effect";

import { historyArchive } from "../src/archival/history-archiver.ts";
import type { UnarchivedRow } from "../src/archival/contracts.ts";

const fernetKey = "cw_0x689RpI-jtRR7oE8h_eQsKImvJapLeSbXpwF4e4=";

function decryptFernet(token: Uint8Array): Buffer {
  const bytes = Buffer.from(Buffer.from(token).toString("ascii"), "base64");
  const decipher = createDecipheriv(
    "aes-128-cbc",
    Buffer.from(fernetKey, "base64").subarray(16, 32),
    bytes.subarray(9, 25),
  );
  return Buffer.concat([decipher.update(bytes.subarray(25, -32)), decipher.final()]);
}

const row = (projectId: string | null): UnarchivedRow => ({
  workflowId: "workflow-inline",
  runId: "run-inline",
  workflowType: "TestWorkflow",
  projectId: projectId,
  projectVersion: "4",
  status: "completed",
});

describe("Temporal Job history archive", () => {
  afterEach(() => setSystemTime());

  test("encrypts the incumbent snake-case gzip envelope under the exact project key", () => {
    setSystemTime(new Date("2026-07-18T01:02:03.004Z"));
    const archive = historyArchive(
      row("project-test"),
      [
        {
          eventId: "1",
          workflowExecutionStartedEventAttributes: {
            input: {
              payloads: [
                {
                  metadata: { encoding: "anNvbi9wbGFpbg==" },
                  data: "eyJoZWxsbyI6IndvcmxkIn0=",
                  decoded: { hello: "world" },
                },
              ],
            },
          },
        },
      ],
      {
        prefix: "/temporal-history/",
        encryptionKey: Redacted.make(fernetKey),
      },
    );

    expect(archive.key).toBe(
      "temporal-history/project-test/TestWorkflow/workflow-inline/run-inline.json.gz",
    );
    expect(archive.contentType).toBe("application/octet-stream");
    expect(JSON.parse(gunzipSync(decryptFernet(archive.body)).toString("utf8"))).toEqual({
      workflowId: "workflow-inline",
      runId: "run-inline",
      workflowType: "TestWorkflow",
      projectId: "project-test",
      projectVersion: "4",
      status: "completed",
      archivedAt: "2026-07-18T01:02:03.004000+00:00",
      events: [
        {
          eventId: "1",
          workflowExecutionStartedEventAttributes: {
            input: {
              payloads: [
                {
                  metadata: { encoding: "anNvbi9wbGFpbg==" },
                  data: "eyJoZWxsbyI6IndvcmxkIn0=",
                  decoded: { hello: "world" },
                },
              ],
            },
          },
        },
      ],
    });
  });
});
