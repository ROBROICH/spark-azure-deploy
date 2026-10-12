import {test} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";

const configuredBaseUrl = (): URL | undefined => {
  const value = process.env.FPP_BASE_URL?.trim();
  return value ? new URL(value) : undefined;
};

export const externalTest = configuredBaseUrl() === undefined ? test.skip : test;

const targetUrl = (): URL => {
  const value = configuredBaseUrl();
  if (value === undefined) {
    throw new Error("FPP_BASE_URL must point to an already running FPP service");
  }
  return value;
};

export interface JsonReadResult {
  status: number;
  body: HttpJson;
}

export async function readJson(path: string): Promise<JsonReadResult> {
  const response = await fetch(new URL(path, targetUrl()));
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error(
      `GET ${path} returned ${response.status} with non-JSON content-type '${contentType}'`,
    );
  }
  return { status: response.status, body: (await response.json()) as HttpJson };
}
