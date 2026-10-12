import { opentelemetry } from "@elysia/opentelemetry";
import { currentAuditContext, withAuditContext } from "@spark-workflow/audit-client";
import { Elysia } from "elysia";
import type { AuditActor, AuditInput } from "evlog";
import { createTraceContextEnricher } from "evlog/enrichers";
import { createMiddlewareLogger } from "evlog/toolkit";
import { createLoggerStorage } from "evlog/toolkit/storage";

const requestLogger = createLoggerStorage(
  "HTTP request context",
  "@spark-workflow/http-host.request-logger",
);

export const useLogger = requestLogger.useLogger;

export function recordRequestAudit(event: (actor: AuditActor) => AuditInput) {
  const { actorUserId } = currentAuditContext();
  if (actorUserId === undefined) return;
  useLogger().audit?.(event({ type: "user", id: actorUserId }));
}

export function createHostTelemetry(
  serviceName: string,
  eventAttributes: Readonly<Record<string, string>> = {},
) {
  const enrichTraceContext = createTraceContextEnricher();
  const requestLogging = new Elysia({ name: "@spark-workflow/http-host.request-logging" })
    .wrap((handler, request) => {
      const url = new URL(request.url);
      const requestId = crypto.randomUUID();
      const requestStartTime = new Date().toISOString();
      const requestLog = createMiddlewareLogger({
        method: request.method,
        path: url.pathname,
        requestId,
        headers: Object.fromEntries(request.headers.entries()),
        exclude: ["/healthz", "/ready", "/startup", "/openapi", "/openapi.json"],
        enrich: async (context) => {
          Object.assign(context.event, eventAttributes);
          await enrichTraceContext(context);
        },
      });
      return (...args: unknown[]) =>
        requestLogger.storage.run(requestLog.logger, () =>
          withAuditContext({ requestId, requestStartTime }, async () => {
            const response = await Promise.resolve(handler(...args));
            if (requestLog.skipped) return response;
            if (!(response instanceof Response)) throw new TypeError("Expected an HTTP response");
            return requestLog.finishResponse(response);
          }),
        );
    })
    .as("global");
  return new Elysia({ name: "@spark-workflow/http-host.telemetry" })
    .use(opentelemetry({ serviceName }))
    .use(requestLogging);
}
