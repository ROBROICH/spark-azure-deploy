import { Console } from "node:console";
import { Writable } from "node:stream";
import { format } from "node:util";
import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { cloneDeepWith } from "es-toolkit";
import { Redacted } from "effect";
import { getEnvironment, initLogger, isEnabled, log, type RedactConfig, type WideEvent } from "evlog";
import { deserializeError, serializeError } from "serialize-error";

import { toEcs } from "./ecs.ts";

const useEcs = process.env.LOG_FORMAT === "ecs";

/** A required environment string that stays redacted in logs, String() and JSON. */
export const Secret = Type.Transform(Type.String({ minLength: 1 }))
  .Decode(Redacted.make<string>)
  .Encode(Redacted.value<string>);

const sensitiveKeys = {
  password: true, secret: true, token: true, authorization: true, cookie: true, params: true,
  clientsecret: true, client_secret: true, accesskeyid: true, secretaccesskey: true, encryptionkey: true,
};
const Diagnostic = Type.Object({
  message: Type.String(),
  name: Type.Optional(Type.String()),
  stack: Type.Optional(Type.String()),
  code: Type.Optional(Type.Union([Type.String(), Type.Number()])),
  type: Type.Optional(Type.String()),
}, { additionalProperties: true });
const ValidationDiagnostic = Type.Object({ type: Type.Literal("validation") }, { additionalProperties: true });
const ValidationIssue = Type.Object({
  type: Type.Number(),
  path: Type.String(),
  message: Type.String(),
  schema: Type.Object({}, { additionalProperties: true }),
}, { additionalProperties: true });
const parsedDiagnostic = Symbol("ParsedDiagnostic");
const parsedValidation = Symbol("ParsedValidationDiagnostic");
const JsonBigInt = Type.BigInt();

function parseValidationDiagnostic(message: string) {
  const parsed = JSON.parse(message, (_key, value) => {
    if (Value.Check(ValidationIssue, value)) {
      Object.assign(value, { value: undefined, summary: undefined });
    }
    if (Value.Check(ValidationDiagnostic, value)) {
      Object.assign(value, { found: undefined, summary: undefined });
    }
    return value;
  });
  if (!Value.Check(ValidationDiagnostic, parsed)) return;
  return Object.assign(parsed, { [parsedValidation]: true });
}

function redactDiagnostic(diagnostic: Static<typeof Diagnostic> & { [parsedDiagnostic]: true }) {
  const original = diagnostic.message;
  if (diagnostic.code === "VALIDATION" || diagnostic.name === "ValidationError") {
    diagnostic.message = "Input does not match the declared contract";
    try {
      const validation = parseValidationDiagnostic(original);
      if (validation !== undefined) diagnostic.message = JSON.stringify(validation);
    } catch {}
    Object.assign(diagnostic, { found: undefined, value: undefined, summary: undefined });
  } else if (diagnostic.name === "PostgresError" || diagnostic.code === "ERR_POSTGRES_SERVER_ERROR") {
    diagnostic.message = "PostgreSQL request failed";
    Object.assign(diagnostic, { detail: undefined });
  } else if (original.startsWith("Failed query:")) {
    diagnostic.message = "Database query failed";
    Object.assign(diagnostic, { params: undefined });
  }
  diagnostic.stack = diagnostic.stack?.replace(original, () => diagnostic.message);
}

const redactField: Parameters<typeof cloneDeepWith>[1] = (value, key, _source, stack) => {
  if (key === "schema" || key === "expected" || Redacted.isRedacted(value)) return value;
  if (key !== undefined && Object.hasOwn(sensitiveKeys, String(key).toLowerCase())) return "[REDACTED]";
  if (stack.has(value)) return "[Circular]";
  if (value instanceof Error) return deserializeError(redactError(value));
};

function redactError(error: Error | Static<typeof Diagnostic>) {
  return cloneDeepWith(serializeError(error, { useToJSON: false }), (value, key, source, stack) => {
    const replacement = redactField(value, key, source, stack);
    if (replacement !== undefined) return replacement;
    if (Value.Check(Diagnostic, value)) {
      redactDiagnostic(Object.assign(value, { [parsedDiagnostic]: true as const }));
    }
    if (Value.Check(ValidationIssue, value)) {
      Object.assign(value, { value: undefined, summary: undefined });
    }
  });
}

const redaction = {
  builtins: false,
  paths: Object.keys(sensitiveKeys).map((key) => `*.${key}`),
  transform(event) {
    try {
      const error = event.error;
      if (error instanceof Error || Value.Check(Diagnostic, error)) {
        const diagnostic = redactError(error);
        if (event.message === error.message) event.message = diagnostic.message;
        event.error = diagnostic;
      }
      Object.assign(event, cloneDeepWith(event, redactField));
    } catch {
      const fallback = {
        ...getEnvironment(),
        timestamp: new Date().toISOString(),
        level: "error",
        message: "Log event could not be serialized",
        error: { name: "SerializationError", message: "Log event could not be serialized" },
      };
      for (const key of Object.keys(event)) delete event[key];
      Object.assign(event, fallback);
    }
  },
} satisfies RedactConfig;

function line(event: WideEvent): string {
  try {
    const seen = new WeakSet<object>();
    return JSON.stringify(useEcs ? toEcs(event) : event, function (key, value) {
      if (value instanceof Error) return serializeError(value, { useToJSON: false });
      if (Value.Check(JsonBigInt, value)) return value.toString();
      if (value instanceof Object) {
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
      }
      return value;
    });
  } catch {
    const unserializable = {
      ...getEnvironment(),
      timestamp: new Date().toISOString(),
      level: "error",
      message: "Log event could not be serialized",
      error: { name: "SerializationError", message: "Log event could not be serialized" },
    } satisfies WideEvent;
    return JSON.stringify(useEcs ? toEcs(unserializable) : unserializable);
  }
}

let failed = false;

/** True once an unhandled error has ended the process; it only waits for its output to drain. */
export const processFailed = (): boolean => failed;

export function ownProcessOutput(service: string): void {
  let pending = 0;
  const write = (text: string) => {
    pending += 1;
    process.stdout.write(text, () => {
      pending -= 1;
      if (failed && pending === 0) process.exit(1);
    });
  };
  process.stdout.once("error", () => process.exit(1));
  initLogger({
    env: { service },
    pretty: false,
    silent: true,
    redact: redaction,
    enabled: isEnabled(),
    drain: ({ event }) => write(`${line(event)}\n`),
  });

  let level: "debug" | "info" | "warn" | "error" = "info";
  let error: unknown;
  const formatter = new Console(
    new Writable({
      write(chunk, _encoding, done) {
        log[level]({ message: String(chunk).trimEnd(), error });
        done();
      },
    }),
  );
  for (const [method, call] of Object.entries(formatter)) {
    if (!(call instanceof Function)) continue;
    Reflect.set(console, method, (...args: Parameters<typeof console.log>) => {
      const outer = { level, error };
      switch (method) {
        case "debug": level = "debug"; break;
        case "warn": level = "warn"; break;
        case "error":
        case "assert": level = "error"; break;
        default: level = "info";
      }
      error = undefined;
      call(...args.map((arg) => {
        if (!(arg instanceof Error)) return cloneDeepWith(arg, redactField);
        const diagnostic = redactError(arg);
        error ??= diagnostic;
        return deserializeError(diagnostic);
      }));
      ({ level, error } = outer);
    });
  }
  const trace = (...args: Parameters<typeof console.log>) => {
    const site = { stack: "" };
    Error.captureStackTrace(site, trace);
    log.debug({ message: `Trace: ${format(...args.map((arg) => cloneDeepWith(arg, redactField)))}`, stack: site.stack });
  };
  Reflect.set(console, "trace", trace);
  Reflect.set(console, "write", (...data: Parameters<typeof console.log>) =>
    log.info({ message: data.join("").trimEnd() }),
  );

  // Bun's default warning listener writes directly to stderr, bypassing redaction.
  process.removeAllListeners("warning");
  process.on("warning", (warning) => log.warn({ message: warning.message, error: warning }));
  const exit = (cause: unknown) => {
    const fatal = {
      ...getEnvironment(),
      timestamp: new Date().toISOString(),
      level: "error",
      message: "Process terminated by an unhandled error",
      error: cause,
    } satisfies WideEvent;
    redaction.transform(fatal);
    failed = true;
    process.exitCode = 1;
    write(`${line(fatal)}\n`);
  };
  process.on("uncaughtException", exit);
  process.on("unhandledRejection", exit);
}
