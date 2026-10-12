import type { WideEvent } from "evlog";

declare module "evlog" {
  interface BaseWideEvent {
    method?: string;
    path?: string;
    requestId?: string;
    spanId?: string;
    status?: number;
    traceId?: string;
  }
}

interface LoggedError {
  readonly name?: string;
  readonly message?: string;
  readonly stack?: string;
  readonly cause?: unknown;
  readonly errors?: unknown;
}

export function toEcs({
  timestamp,
  level,
  service,
  environment,
  version,
  traceId,
  spanId,
  requestId,
  method,
  path,
  status,
  duration: _duration,
  durationMs,
  error,
  ...fields
}: WideEvent & { readonly error?: LoggedError | string }) {
  let ecsError;
  if (error instanceof Object) {
    const { name, message, stack, ...details } = error;
    ecsError = {
      ...details,
      type: name,
      message,
      stack_trace: stack,
      cause: error.cause,
      errors: error.errors,
    };
  } else if (error !== undefined) {
    ecsError = { message: error };
  }
  return {
    ...fields,
    "@timestamp": timestamp,
    "log.level": level,
    "service.name": service,
    "service.environment": environment,
    "service.version": version,
    "trace.id": traceId,
    "span.id": spanId,
    "http.request.id": requestId,
    "http.request.method": method,
    "url.path": path,
    "http.response.status_code": status,
    "event.duration": durationMs === undefined ? undefined : Math.round(durationMs * 1_000_000),
    error: ecsError,
    "ecs.version": "8.11.0",
  };
}
