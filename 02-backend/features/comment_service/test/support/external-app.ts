import {test} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";

export const externalTest =
  process.env.COMMENT_BASE_URL === undefined ? test.skip : test;

export interface JsonResponse {
  status: number;
  body: HttpJson;
}

export interface TextResponse {
  status: number;
  body: string;
}

export interface MutationRequest {
  body?: HttpJson;
  headers?: Record<string, string>;
  target?: "primary" | "atomic-failure";
}

function commentBaseUrl(): string {
  const configured = process.env.COMMENT_BASE_URL;
  if (!configured) {
    throw new Error(
      "COMMENT_BASE_URL must point to an externally supervised incumbent Comment service",
    );
  }
  const url = new URL(configured);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("COMMENT_BASE_URL must be an HTTP URL");
  }
  return configured.replace(/\/$/, "");
}

export async function readJson(path: string): Promise<JsonResponse> {
  const response = await fetch(`${commentBaseUrl()}${path}`);
  const text = await response.text();
  let body: HttpJson = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Comment test returned non-JSON for GET ${path}`);
  }
  return { status: response.status, body };
}

function mutationBaseUrl(target: MutationRequest["target"]): string {
  const name =
    target === "atomic-failure"
      ? "COMMENT_ATOMIC_FAILURE_BASE_URL"
      : "COMMENT_BASE_URL";
  const configured = process.env[name];
  if (!configured) {
    throw new Error(
      `${name} must point to an externally supervised Comment service`,
    );
  }
  const url = new URL(configured);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must be an HTTP URL`);
  }
  return configured.replace(/\/$/, "");
}

function mutationRequestInit(
  method: "DELETE" | "PATCH" | "POST",
  request: MutationRequest,
): RequestInit {
  const headers = new Headers(request.headers);
  let body: string | undefined;
  if (request.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(request.body);
  }
  return {
    method,
    headers,
    body,
  };
}

export async function requestMutationJson(
  method: "PATCH" | "POST",
  path: string,
  request: MutationRequest,
): Promise<JsonResponse> {
  const response = await fetch(
    `${mutationBaseUrl(request.target)}${path}`,
    mutationRequestInit(method, request),
  );
  const text = await response.text();
  let body: HttpJson = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Comment test returned non-JSON for ${method} ${path}`);
  }
  return { status: response.status, body };
}

export async function deleteMutation(
  path: string,
  request: Omit<MutationRequest, "body">,
): Promise<TextResponse> {
  const response = await fetch(
    `${mutationBaseUrl(request.target)}${path}`,
    mutationRequestInit("DELETE", request),
  );
  return { status: response.status, body: await response.text() };
}
