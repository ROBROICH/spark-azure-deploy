import { gzipSync } from "node:zlib";
import { Redacted } from "effect";

import type { UnarchivedRow } from "./contracts.ts";
import { encryptFernet } from "./fernet.ts";
import type { ArchiveJsonObject } from "./history-gateway.ts";

export function historyArchive(
  row: UnarchivedRow,
  events: ArchiveJsonObject[],
  options: {
    readonly prefix: string;
    readonly encryptionKey: Redacted.Redacted<string>;
  },
) {
  const prefix = options.prefix.replace(/^\/+|\/+$/g, "");
  if (prefix.length === 0) {
    throw new TypeError("archive prefix must not be empty");
  }
  const envelope = {
    workflowId: row.workflowId,
    runId: row.runId,
    workflowType: row.workflowType,
    projectId: row.projectId,
    projectVersion: row.projectVersion,
    status: row.status,
    archivedAt: `${new Date().toISOString().slice(0, -1)}000+00:00`,
    events,
  };
  return {
    key: `${prefix}/${row.projectId ?? "unknown"}/${row.workflowType}/${row.workflowId}/${row.runId}.json.gz`,
    body: encryptFernet(
      gzipSync(Buffer.from(JSON.stringify(envelope), "utf8")),
      Redacted.value(options.encryptionKey),
    ),
    contentType: "application/octet-stream",
  };
}
