import type {HttpJson} from "@spark-workflow/http-host";

export interface MutationJsonResult {
  status: number;
  body: HttpJson;
}

export interface MutationRawResult {
  status: number;
  text: string;
  contentType: string | null;
}

const mutationTarget = (): URL => {
  const value = process.env.PLS_MUTATION_BASE_URL;
  if (value === undefined) {
    throw new Error(
      "PLS_MUTATION_BASE_URL must point to an already running incumbent Project Logic service",
    );
  }
  return new URL(value);
};

export async function mutateJson(path: string, init: RequestInit): Promise<MutationJsonResult> {
  const response = await fetch(new URL(path, mutationTarget()), init);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error(
      `${init.method ?? "GET"} ${path} returned ${response.status} with non-JSON content-type '${contentType}'`,
    );
  }
  return { status: response.status, body: await response.json() };
}

export async function mutateRaw(path: string, init: RequestInit): Promise<MutationRawResult> {
  const response = await fetch(new URL(path, mutationTarget()), init);
  return {
    status: response.status,
    text: await response.text(),
    contentType: response.headers.get("content-type"),
  };
}

export const mutationRequest = (
  method: "GET" | "POST" | "PATCH" | "DELETE",
  body?: HttpJson,
  headers: Record<string, string> = {},
): RequestInit => {
  const request: RequestInit = { method, headers };
  if (body !== undefined) {
    request.headers = { "content-type": "application/json", ...headers };
    request.body = JSON.stringify(body);
  }
  return request;
};

export const AUDIT_HEADERS = {
  "X-Actor-User-Id": "71000000-0000-4000-8000-000000000001",
  "X-Triggered-By-User-Id": "71000000-0000-4000-8000-000000000002",
  "X-Workflow-Run-Id": "project-logic-mutation-run",
  "X-Workflow-Type": "ProjectLogicMutationTest",
  "X-Request-Starttime": "2026-07-17T06:00:00Z",
  "X-Request-Id": "71000000-0000-4000-8000-000000000099",
};
