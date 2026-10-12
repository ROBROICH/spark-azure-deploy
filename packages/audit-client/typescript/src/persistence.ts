import { getTableColumns } from "drizzle-orm";

import { currentAuditContext, type AuditContext } from "./context";
import { auditLogs } from "./schema";

type MutationAuditEntry = {
  readonly entityType: string;
  readonly entityId: string;
  readonly changeType: "create" | "update" | "delete";
  readonly actionType?: string;
};

type ActionAuditEntry = {
  readonly entityType: string;
  readonly entityId: string;
  readonly changeType: "action";
  readonly actionType: string;
};

export type AuditEntry = MutationAuditEntry | ActionAuditEntry;

type AuditRow = typeof auditLogs.$inferInsert;

interface AuditTransaction {
  insert(table: typeof auditLogs): {
    values(value: AuditRow): PromiseLike<unknown>;
    values(values: AuditRow[]): PromiseLike<unknown>;
  };
}

export function auditEntry(
  projectId: string,
  entry: AuditEntry,
  context: AuditContext = currentAuditContext(),
) {
  return {
    id: crypto.randomUUID(),
    projectId,
    entityId: entry.entityId,
    entityType: entry.entityType,
    changeType: entry.changeType,
    actionType: entry.actionType ?? null,
    actorUserId: context.actorUserId ?? null,
    triggeredByUserId: context.triggeredByUserId ?? null,
    workflowRunId: context.workflowRunId ?? null,
    workflowType: context.workflowType ?? null,
    requestStartTime: context.requestStartTime ? new Date(context.requestStartTime) : null,
    requestId: context.requestId ?? null,
  };
}

export async function recordAuditEntry(
  transaction: AuditTransaction,
  input: AuditEntry & { readonly projectId: string },
): Promise<void> {
  await transaction.insert(auditLogs).values(auditEntry(input.projectId, input));
}

const MAX_STATEMENT_PARAMETERS = 60_000;

const AUDIT_INSERT_CHUNK_ROWS = Math.max(
  1,
  Math.floor(MAX_STATEMENT_PARAMETERS / Object.keys(getTableColumns(auditLogs)).length),
);

export async function recordAuditEntries(
  transaction: AuditTransaction,
  input: {
    readonly projectId: string;
    readonly entries: readonly AuditEntry[];
    readonly context?: AuditContext;
    readonly includeRequestContext?: boolean;
  },
): Promise<void> {
  if (input.entries.length === 0) return;
  const rows = input.entries.map((entry) => auditEntry(input.projectId, entry, input.context));
  if (input.includeRequestContext === false) {
    for (const row of rows) {
      row.requestStartTime = null;
      row.requestId = null;
    }
  }
  for (let offset = 0; offset < rows.length; offset += AUDIT_INSERT_CHUNK_ROWS) {
    await transaction
      .insert(auditLogs)
      .values(rows.slice(offset, offset + AUDIT_INSERT_CHUNK_ROWS));
  }
}
