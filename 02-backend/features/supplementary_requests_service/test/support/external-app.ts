import {test} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";

export const externalTest =
  process.env.SUPPLEMENTARY_REQUESTS_BASE_URL === undefined ? test.skip : test;

export interface JsonReadResult {
  status: number;
  body: HttpJson;
}

function supplementaryRequestsBaseUrl(): string {
  const configured = process.env.SUPPLEMENTARY_REQUESTS_BASE_URL;
  if (!configured) {
    throw new Error(
      "SUPPLEMENTARY_REQUESTS_BASE_URL must point to an externally supervised incumbent Supplementary Requests service",
    );
  }
  const url = new URL(configured);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("SUPPLEMENTARY_REQUESTS_BASE_URL must be an HTTP URL");
  }
  return configured.replace(/\/$/, "");
}

export async function readJson(path: string): Promise<JsonReadResult> {
  const response = await fetch(`${supplementaryRequestsBaseUrl()}${path}`);
  const text = await response.text();
  let body: HttpJson = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Supplementary Requests test returned non-JSON for GET ${path}`);
  }
  return { status: response.status, body };
}
