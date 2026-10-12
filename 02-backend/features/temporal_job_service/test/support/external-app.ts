import { test } from "bun:test"
import type { HttpJson } from "@spark-workflow/http-host"

function configuredBaseUrl(): URL | undefined {
  const value = process.env.TEMPORAL_JOB_BASE_URL?.trim()
  return value ? new URL(value) : undefined
}

export const externalTest = configuredBaseUrl() === undefined ? test.skip : test

export interface JsonResponse {
  status: number
  body: HttpJson
}

export async function readJson(path: string, init?: RequestInit): Promise<JsonResponse> {
  const baseUrl = configuredBaseUrl()
  if (baseUrl === undefined) {
    throw new Error("TEMPORAL_JOB_BASE_URL must point to an externally supervised service")
  }
  const response = await fetch(new URL(path, baseUrl), init)
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} returned ${response.status} with non-JSON content-type '${contentType}'`,
    )
  }
  return { status: response.status, body: await response.json() }
}
