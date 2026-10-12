import {test} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";

export const externalTest = process.env.FCS_BASE_URL === undefined ? test.skip : test;

const targetUrl = (): URL => {
  const value = process.env.FCS_BASE_URL;
  if (value === undefined) {
    throw new Error(
      "FCS_BASE_URL must point to an already running incumbent Formal Completeness Check service",
    );
  }
  return new URL(value);
};

export interface JsonReadResult {
  status: number;
  body: HttpJson;
}

export async function readJson(path: string, init?: RequestInit): Promise<JsonReadResult> {
  const response = await fetch(new URL(path, targetUrl()), init);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} returned ${response.status} with non-JSON content-type '${contentType}'`,
    );
  }
  return {
    status: response.status,
    body: await response.json(),
  };
}
