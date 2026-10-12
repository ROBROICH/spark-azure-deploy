import { test } from "bun:test"
import type { HttpJson } from "@spark-workflow/http-host"

export type DocumentManagementTarget = "primary" | "storage-failure"

const readSelectorsAbsent =
  process.env.DMS_BASE_URL === undefined &&
  process.env.DMS_STORAGE_FAILURE_BASE_URL === undefined

export const externalTest = readSelectorsAbsent ? test.skip : test

const environmentName = (target: DocumentManagementTarget) =>
  target === "primary" ? "DMS_BASE_URL" : "DMS_STORAGE_FAILURE_BASE_URL"

const targetUrl = (target: DocumentManagementTarget): URL => {
  const name = environmentName(target)
  const value = process.env[name]
  if (value === undefined) {
    throw new Error(`${name} must point to an already running Document Management service`)
  }
  return new URL(value)
}

export const request = (
  path: string,
  init?: RequestInit,
  target: DocumentManagementTarget = "primary",
) => fetch(new URL(path, targetUrl(target)), init)

export interface JsonReadResult {
  status: number
  body: HttpJson
}

const dynamicCorrelationId = /correlationId=[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi
const absolutePythonFrame = /File "[^"]+\/(02-backend|04-shared-services)\//g

export async function readJson(
  path: string,
  init?: RequestInit,
  target: DocumentManagementTarget = "primary",
): Promise<JsonReadResult> {
  const response = await request(path, init, target)
  const contentType = response.headers.get("content-type") ?? ""
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new Error(
      `${init?.method ?? "GET"} ${path} returned ${response.status} with non-JSON content-type '${contentType}'`,
    )
  }

  return {
    status: response.status,
    body: JSON.parse(JSON.stringify(await response.json()), (key, nested) => {
      if (key === "sys_period") {
        const text = `${nested}`
        if (!/^\[".*",\)$/.test(text)) {
          throw new Error(`Unexpected incumbent sys_period value: ${JSON.stringify(nested)}`)
        }
        return '["<fixture-start>",)'
      }
      const encodedNested = JSON.stringify(nested)
      if (encodedNested !== undefined && encodedNested.startsWith('"')) {
        return String(JSON.parse(encodedNested))
          .replace(dynamicCorrelationId, "correlation_id=<fixture-uuid>")
          .replace(absolutePythonFrame, 'File "<repo>/$1/')
      }
      return nested
    }) as HttpJson,
  }
}

export async function putSignedUrl(url: string, body: string, contentType: string): Promise<Response> {
  return fetch(url, {
    method: "PUT",
    headers: { "content-type": contentType },
    body,
  })
}
