import { test } from "bun:test"
import type { HttpJson } from "@spark-workflow/http-host"

export type AdministrativeFileDraftTarget = "primary" | "converter-failure"

const readSelectorsAbsent =
  process.env.AFD_BASE_URL === undefined &&
  process.env.AFD_CONVERTER_FAILURE_BASE_URL === undefined

export const externalTest = readSelectorsAbsent ? test.skip : test

const environmentName = (target: AdministrativeFileDraftTarget) =>
  target === "primary" ? "AFD_BASE_URL" : "AFD_CONVERTER_FAILURE_BASE_URL"

const targetUrl = (target: AdministrativeFileDraftTarget): URL => {
  const name = environmentName(target)
  const value = process.env[name]

  if (value === undefined) {
    throw new Error(`${name} must point to an already running Administrative File Draft service`)
  }

  return new URL(value)
}

const request = (
  path: string,
  init?: RequestInit,
  target: AdministrativeFileDraftTarget = "primary",
) => fetch(new URL(path, targetUrl(target)), init)

export interface JsonReadResult {
  status: number
  body: HttpJson
}

export async function readJson(
  path: string,
  init?: RequestInit,
  target: AdministrativeFileDraftTarget = "primary",
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
    body: await response.json(),
  }
}

export interface DocumentReadResult {
  status: number
  contentDisposition: string | null
  contentType: string | null
  bytes: Uint8Array
}

export async function readDocument(
  path: string,
  init?: RequestInit,
  target: AdministrativeFileDraftTarget = "primary",
): Promise<DocumentReadResult> {
  const response = await request(path, init, target)

  return {
    status: response.status,
    contentDisposition: response.headers.get("content-disposition"),
    contentType: response.headers.get("content-type"),
    bytes: new Uint8Array(await response.arrayBuffer()),
  }
}
