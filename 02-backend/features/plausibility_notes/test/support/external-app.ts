import {test} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";


export const externalTest = process.env.PLAUSIBILITY_BASE_URL === undefined ? test.skip : test;

export interface JsonResponse {
  status: number;
  body: HttpJson;
}

function plausibilityBaseUrl(): string {
  const configured = process.env.PLAUSIBILITY_BASE_URL;
  if (!configured) {
    throw new Error(
      "PLAUSIBILITY_BASE_URL must point to an externally supervised incumbent Plausibility service",
    );
  }
  const url = new URL(configured);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("PLAUSIBILITY_BASE_URL must be an HTTP URL");
  }
  return configured.replace(/\/$/, "");
}

export async function readJson(path: string, init?: RequestInit): Promise<JsonResponse> {
  const headers = new Headers(init?.headers);
  headers.set("connection", "close");
  const response = await fetch(`${plausibilityBaseUrl()}${path}`, { ...init, headers });
  const text = await response.text();
  let body: HttpJson = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Plausibility test returned non-JSON for ${init?.method ?? "GET"} ${path}`);
  }
  return { status: response.status, body };
}
