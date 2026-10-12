import {test} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";

const configuredUrl = (name: "PLS_BASE_URL" | "PLS_STRICT_BASE_URL"): URL | undefined => {
  const value = process.env[name]?.trim();
  return value ? new URL(value) : undefined;
};

export const externalTest = configuredUrl("PLS_BASE_URL") === undefined ? test.skip : test;
export const strictExternalTest =
  configuredUrl("PLS_STRICT_BASE_URL") === undefined ? test.skip : test;

export interface JsonReadResult {
  status: number;
  body: HttpJson;
}

export interface RawReadResult {
  status: number;
  contentType: string | null;
  text: string;
}

export async function readJson(
  path: string,
  init?: RequestInit,
  target: "PLS_BASE_URL" | "PLS_STRICT_BASE_URL" = "PLS_BASE_URL",
): Promise<JsonReadResult> {
  const baseUrl = configuredUrl(target);
  if (baseUrl === undefined) throw new Error(`${target} must point to an already running service`);
  const response = await fetch(new URL(path, baseUrl), init);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} returned ${response.status} with non-JSON content-type '${contentType}'`,
    );
  }
  return { status: response.status, body: await response.json() };
}

export async function readRaw(path: string, init?: RequestInit): Promise<RawReadResult> {
  const baseUrl = configuredUrl("PLS_BASE_URL");
  if (baseUrl === undefined)
    throw new Error("PLS_BASE_URL must point to an already running service");
  const response = await fetch(new URL(path, baseUrl), init);
  return {
    status: response.status,
    contentType: response.headers.get("content-type"),
    text: await response.text(),
  };
}

export const bearer = (token: string) => ({
  authorization: `Bearer ${token}`,
});

export const requiredStrictToken = (
  name: "PLS_VIEWER_TOKEN" | "PLS_USER_TOKEN" | "PLS_FORBIDDEN_TOKEN",
): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required with PLS_STRICT_BASE_URL`);
  return value;
};

export const requiredStrictSubject = (
  name: "PLS_VIEWER_SUBJECT" | "PLS_USER_SUBJECT" | "PLS_FORBIDDEN_SUBJECT",
): string => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required with PLS_STRICT_BASE_URL`);
  return value;
};
