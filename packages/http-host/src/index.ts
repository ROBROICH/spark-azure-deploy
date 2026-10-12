import { openapi } from "@elysia/openapi";
import { authentication } from "@spark-workflow/authentification";
import { Elysia, status, t, type Static, type ValidationError } from "elysia";
import { EvlogError } from "evlog";

import type { HttpJson } from "./json.ts";
import { processFailed } from "./process-output.ts";
import { InvalidRestQueryError } from "./rest.ts";
import { resultResponses } from "./result-response.ts";
import { createHostTelemetry, useLogger } from "./telemetry.ts";

export {
  createFeatureHttp,
  RequestedProjectVersionQuery,
  type FeatureHttp,
  type ProjectVersionSource,
} from "./feature-http.ts";
export { canonicalizeOpenApiSchemaReferences } from "./openapi.ts";
export { httpJsonObject, isoInstant, type HttpJson, type HttpJsonObject } from "./json.ts";
export {
  assertRestQuery,
  InvalidRestQueryError,
  RestPaginationQueryProperties,
  RestQueryErrorSchema,
  parseRestPagination,
  restPageResponseSchema,
  restPaginationMetadata,
  type RestPagination,
  type RestPaginationMetadata,
  type RestPaginationQuery,
} from "./rest.ts";
export { recordRequestAudit, useLogger } from "./telemetry.ts";
export { resultOf } from "./result-response.ts";

export class PeerContractError extends Error {
  constructor(
    readonly service: string,
    readonly operation: string,
    readonly failure: "invalid-response" | "source-too-large" | "source-not-configured",
    readonly peerStatus?: number,
  ) {
    super(`${service} ${operation} failed peer contract: ${failure}`);
    this.name = "PeerContractError";
  }
}

export const CheckResponse = t.Object(
  { status: t.UnionEnum(["ok", "starting", "draining"]) },
  { additionalProperties: false },
);

export type HttpHostPhase = "starting" | "accepting" | "draining";

export interface HttpHostState {
  readonly phase: HttpHostPhase;
  markAccepting(): void;
  markDraining(): void;
}

export function createHttpHostState(): HttpHostState {
  let phase: HttpHostPhase = "starting";

  return {
    get phase() {
      return phase;
    },
    markAccepting() {
      phase = "accepting";
    },
    markDraining() {
      phase = "draining";
    },
  };
}

export const createController = (name: string) =>
  new Elysia({ name, normalize: false }).use(resultResponses).use(authentication);

export const createPublicController = (name: string) =>
  new Elysia({ name, normalize: false }).use(resultResponses);

export function createHttpHost(
  serviceName: string,
  options: Readonly<{
    openApiTitle?: string;
    eventAttributes?: Readonly<Record<string, string>>;
    mapOpenApi?: (document: HttpJson) => HttpJson;
    state?: HttpHostState;
  }> = {},
) {
  const state = options.state;
  return createPublicController(`${serviceName}.http-host`)
    .use(createHostTelemetry(serviceName, options.eventAttributes))
    .onRequest(({ set }) => {
      if (!processFailed()) return;
      set.status = 503;
      return { detail: "Service unavailable" };
    })
    .onAfterHandle(({ request, responseValue }) => {
      if (new URL(request.url).pathname !== "/openapi.json") {
        return;
      }
      const source: HttpJson = JSON.parse(JSON.stringify(responseValue));
      return options.mapOpenApi?.(source) ?? source;
    })
    .use(
      openapi({
        path: "/openapi",
        specPath: "/openapi.json",
        documentation: {
          openapi: "3.1.0",
          info: { title: options.openApiTitle ?? serviceName, version: "0.0.0" },
        },
      }),
    )
    .onError({ as: "global" }, ({ code, error, set }) => {
      useLogger().error(
        error instanceof Error ? error : new Error("Unknown HTTP error", { cause: error }),
      );

      if (EvlogError.isEvlogError(error)) {
        set.status = error.status;
        return { detail: error.message };
      }
      if (error instanceof InvalidRestQueryError) {
        set.status = 400;
        return { detail: error.message };
      }
      if (code === "NOT_FOUND") {
        set.status = 404;
        return { detail: "Not Found" };
      }
      if (code === "VALIDATION") {
        const validation = error as ValidationError & {
          error?: ValidationError["valueError"];
        };
        const issues = validation.all ?? (validation.error ? [validation.error] : []);
        set.status = 422;
        return {
          detail: issues.map((issue) => {
            const path = String(issue.path ?? "")
              .split("/")
              .filter(Boolean);
            return {
              type: String(issue.type ?? "value_error"),
              loc: [validation.type || "body", ...path],
              msg: issue.message || "Input should match the declared contract",
              input: issue.value ?? null,
            };
          }),
        };
      }
      set.status = 500;
      return { detail: "Internal server error" };
    })
    .model({ CheckResponse })
    .get("/healthz", () => ({ status: "ok" }) satisfies Static<typeof CheckResponse>, {
      response: CheckResponse,
      detail: { operationId: "getHealthz" },
    })
    .get(
      "/startup",
      () =>
        state === undefined || state.phase !== "starting"
          ? ({ status: "ok" } satisfies Static<typeof CheckResponse>)
          : status(503, { status: "starting" }),
      {
        response: { 200: CheckResponse, 503: CheckResponse },
        detail: { operationId: "getStartup" },
      },
    )
    .get(
      "/ready",
      () =>
        state === undefined || state.phase === "accepting"
          ? ({ status: "ok" } satisfies Static<typeof CheckResponse>)
          : status(503, { status: state.phase }),
      {
        response: { 200: CheckResponse, 503: CheckResponse },
        detail: { operationId: "getReady" },
      },
    );
}
