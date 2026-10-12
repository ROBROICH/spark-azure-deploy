import type { PayloadCodec } from "@temporalio/common";
import {
  visit,
  walkGetWorkflowExecutionHistoryResponse,
} from "@temporalio/common/lib/internal-non-workflow";
import { temporal } from "@temporalio/proto";

const MAP_FIELDS = new Set(["fields", "indexed_fields", "metadata"]);

export type ArchiveJsonValue =
  | null
  | boolean
  | number
  | string
  | ArchiveJsonValue[]
  | ArchiveJsonObject;

export interface ArchiveJsonObject {
  [key: string]: ArchiveJsonValue;
}

export interface ArchiveEvents extends Array<ArchiveJsonObject> {}

function snakeCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1_$2")
    .toLowerCase();
}

function integer(value: ArchiveJsonValue | undefined): bigint | undefined {
  if (value === undefined || value === null || value instanceof Object) return undefined;
  try {
    return BigInt(value);
  } catch {
    return undefined;
  }
}

function timestampJson(value: ArchiveJsonObject): string | undefined {
  const seconds = integer(value.seconds);
  const nanos = integer(value.nanos ?? 0);
  if (seconds === undefined || nanos === undefined) return undefined;
  const base = new Date(Number(seconds) * 1_000).toISOString().slice(0, 19);
  if (nanos === 0n) return `${base}Z`;
  const digits = nanos.toString().padStart(9, "0");
  const precision = nanos % 1_000_000n === 0n ? 3 : nanos % 1_000n === 0n ? 6 : 9;
  return `${base}.${digits.slice(0, precision)}Z`;
}

function durationJson(value: ArchiveJsonObject): string | undefined {
  const seconds = integer(value.seconds);
  const nanos = integer(value.nanos ?? 0);
  if (seconds === undefined || nanos === undefined) return undefined;
  if (nanos === 0n) return `${seconds}s`;
  const negative = seconds < 0n || nanos < 0n;
  const digits = (nanos < 0n ? -nanos : nanos).toString().padStart(9, "0");
  const precision = nanos % 1_000_000n === 0n ? 3 : nanos % 1_000n === 0n ? 6 : 9;
  return `${negative ? "-" : ""}${seconds < 0n ? -seconds : seconds}.${digits.slice(0, precision)}s`;
}

function normalizeWellKnown(value: ArchiveJsonValue, fieldName?: string): ArchiveJsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeWellKnown(item));
  }
  if (!(value instanceof Object)) return value;
  if (fieldName?.endsWith("Time")) {
    const timestamp = timestampJson(value);
    if (timestamp !== undefined) return timestamp;
  }
  if (fieldName !== undefined && /(Timeout|Duration|Interval|Backoff|Delay)$/.test(fieldName)) {
    const duration = durationJson(value);
    if (duration !== undefined) return duration;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeWellKnown(item, key)]),
  );
}

function snakeCaseHistory(value: ArchiveJsonValue, preserveKeys = false): ArchiveJsonValue {
  if (Array.isArray(value)) {
    return value.map((item) => snakeCaseHistory(item));
  }
  if (!(value instanceof Object)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => {
      const outputKey = preserveKeys ? key : snakeCase(key);
      return [outputKey, snakeCaseHistory(item, MAP_FIELDS.has(outputKey))];
    }),
  );
}

function decodedJson(value: string): ArchiveJsonValue | undefined {
  try {
    const parsed: ArchiveJsonValue = JSON.parse(
      Buffer.from(value, "base64").toString("utf8"),
    );
    return parsed;
  } catch {
    return undefined;
  }
}

function inlineDecodedPayloads(value: ArchiveJsonValue): void {
  if (Array.isArray(value)) {
    for (const item of value) inlineDecodedPayloads(item);
    return;
  }
  if (!(value instanceof Object)) return;
  const metadata = value.metadata;
  if (metadata instanceof Object && !Array.isArray(metadata)) {
    const encoding = metadata.encoding;
    const data = value.data;
    if (encoding !== undefined && data !== undefined) {
      const decodedEncoding = Buffer.from(String(encoding), "base64").toString("utf8");
      if (decodedEncoding === "json/plain" || decodedEncoding === "json/protobuf") {
        const decoded = decodedJson(String(data));
        if (decoded !== undefined) value.decoded = decoded;
      }
    }
  }
  for (const item of Object.values(value)) inlineDecodedPayloads(item);
}

export async function resolveHistoryEvents(
  historyValue: temporal.api.history.v1.IHistory,
  payloadCodec: PayloadCodec,
): Promise<ArchiveEvents> {
  const response = {
    history: temporal.api.history.v1.History.fromObject(historyValue),
  };
  await visit(response, walkGetWorkflowExecutionHistoryResponse, {
    async transformPayload(payload) {
      const [decoded] = await payloadCodec.decode([payload]);
      if (decoded === undefined) {
        throw new TypeError("Temporal payload codec returned no payload");
      }
      return decoded;
    },
    transformPayloads: (payloads) => payloadCodec.decode(payloads),
  });
  const events: ArchiveEvents = response.history.events.map((event) =>
    temporal.api.history.v1.HistoryEvent.fromObject(event).toJSON(),
  );
  const normalized = snakeCaseHistory(normalizeWellKnown(events));
  inlineDecodedPayloads(normalized);
  return normalized as ArchiveEvents;
}
