import { AsyncLocalStorage } from "node:async_hooks";

export interface AuditContext {
  actorUserId?: string;
  triggeredByUserId?: string;
  workflowRunId?: string;
  workflowType?: string;
  requestStartTime?: string;
  requestId?: string;
}

type AuditField = readonly [
  keyof AuditContext,
  string,
  (value: string | undefined) => string | undefined,
];

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isoTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;
const storage = new AsyncLocalStorage<AuditContext>();

function uuid(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized && uuidPattern.test(normalized) ? normalized.toLowerCase() : undefined;
}

function text(value: string | undefined): string | undefined {
  return value?.trim() || undefined;
}

function timestamp(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  const epoch = /^\d+$/.test(normalized) ? Number(normalized) : undefined;
  if (epoch !== undefined && !Number.isSafeInteger(epoch)) return undefined;
  if (epoch === undefined) {
    const match = isoTimestampPattern.exec(normalized);
    if (match === null) return undefined;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (
      date.getUTCFullYear() !== Number(match[1]) ||
      date.getUTCMonth() !== Number(match[2]) - 1 ||
      date.getUTCDate() !== Number(match[3])
    ) {
      return undefined;
    }
  }
  const parsed = new Date(epoch ?? normalized);
  return Number.isNaN(parsed.valueOf()) ? undefined : parsed.toISOString();
}

const fields: readonly AuditField[] = [
  ["actorUserId", "X-Actor-User-Id", uuid],
  ["triggeredByUserId", "X-Triggered-By-User-Id", uuid],
  ["workflowRunId", "X-Workflow-Run-Id", text],
  ["workflowType", "X-Workflow-Type", text],
  ["requestStartTime", "X-Request-Starttime", timestamp],
  ["requestId", "X-Request-Id", uuid],
];

export function withAuditContext<Result>(context: AuditContext, operation: () => Result): Result {
  return storage.run({ ...context }, operation);
}

export function adoptForwardedAuditContext(headers: Headers): void {
  const context = storage.getStore();
  if (context === undefined) return;
  for (const [key, name, normalize] of fields) {
    const value = normalize(headers.get(name) ?? undefined);
    if (value !== undefined) context[key] = value;
  }
}

export function setAuditActor(actorUserId: string | null | undefined): void {
  const context = storage.getStore();
  if (context === undefined) return;
  const actor = uuid(actorUserId ?? undefined);
  if (actor === undefined) delete context.actorUserId;
  else context.actorUserId = actor;
}

export function currentAuditContext(): AuditContext {
  return { ...storage.getStore() };
}

export function auditRequestInit(init: RequestInit = {}): RequestInit {
  const headers = new Headers();
  const context = storage.getStore();
  for (const [key, name] of fields) {
    const value = context?.[key];
    if (value !== undefined) headers.set(name, value);
  }
  for (const [name, value] of new Headers(init.headers)) headers.set(name, value);
  return { ...init, headers };
}
