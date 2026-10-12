import {test} from "bun:test";
import type {HttpJson} from "@spark-workflow/http-host";

export const externalTest =
  process.env.EXAMINATION_BASE_URL === undefined ? test.skip : test;

export interface JsonResponse {
  status: number;
  body: HttpJson;
  headers: Headers;
}

function examinationBaseUrl(): string {
  const configured = process.env.EXAMINATION_BASE_URL;
  if (!configured) {
    throw new Error(
      "EXAMINATION_BASE_URL must point to an externally supervised incumbent Examination service",
    );
  }
  const url = new URL(configured);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("EXAMINATION_BASE_URL must be an HTTP URL");
  }
  return configured.replace(/\/$/, "");
}

export async function readJson(path: string, init?: RequestInit): Promise<JsonResponse> {
  const response = await fetch(`${examinationBaseUrl()}${path}`, init);
  const text = await response.text();
  let body: HttpJson = null;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Examination test returned non-JSON for ${init?.method ?? "GET"} ${path}`);
  }
  return { status: response.status, body, headers: response.headers };
}
