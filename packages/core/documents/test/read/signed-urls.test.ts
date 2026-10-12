import { describe, expect } from "bun:test"

import {
  DownloadUrlSchema,
  ErrorResponseSchema,
  UploadUrlSchema,
  parseReadContract,
} from "../support/read-contracts.ts"
import {
  externalTest,
  putSignedUrl,
  readJson,
} from "../support/external-app.ts"
import { readScenarios } from "../support/read-scenarios.ts"
import { storageFailureCallCount } from "../setup/read-boundary.ts"

const withStorageDelta = async <T>(
  expectedStorageDenial: 0 | 1,
  request: () => Promise<T>,
): Promise<T> => {
  const storageBefore = storageFailureCallCount()
  const result = await request()
  expect(storageFailureCallCount()).toBe(storageBefore + expectedStorageDenial)
  return result
}

const signatureFields = (value: string) => {
  const url = new URL(value)
  return {
    protocol: url.protocol,
    host: url.host,
    path: decodeURIComponent(url.pathname),
    hasCredential: url.searchParams.has("X-Amz-Credential"),
    hasDate: url.searchParams.has("X-Amz-Date"),
    hasExpires: url.searchParams.has("X-Amz-Expires"),
    hasSignature: url.searchParams.has("X-Amz-Signature"),
    signedHeaders: url.searchParams.get("X-Amz-SignedHeaders"),
  }
}

describe("GET /v2/files/{file_id}/generate-download-url HTTP contract", () => {
  externalTest("executes attachment and inline URLs against qualified real local storage", async () => {
    const path = `/v2/files/${readScenarios.files.versioned}/generate-download-url?projectVersion=3`
    const [attachment, inline] = await Promise.all([
      withStorageDelta(0, () =>
        readJson(`${path}&inline=false`)),
      withStorageDelta(0, () =>
        readJson(`${path}&inline=true`)),
    ])
    const attachmentBody = parseReadContract(DownloadUrlSchema, attachment.body)
    const inlineBody = parseReadContract(DownloadUrlSchema, inline.body)
    const [attachedFile, inlineFile] = await Promise.all([
      fetch(attachmentBody.downloadUrl),
      fetch(inlineBody.downloadUrl),
    ])

    expect(attachment.status).toBe(200)
    expect(signatureFields(attachmentBody.downloadUrl)).toMatchObject({
      protocol: "http:",
      hasCredential: true,
      hasDate: true,
      hasExpires: true,
      hasSignature: true,
    })
    expect(await attachedFile.text()).toBe(readScenarios.downloads.currentBody)
    expect(attachedFile.headers.get("content-type")).toBe("application/pdf")
    expect(attachedFile.headers.get("content-disposition")).toBe(
      'attachment; filename="basis.pdf"',
    )
    expect(await inlineFile.text()).toBe(readScenarios.downloads.currentBody)
    expect(inlineFile.headers.get("content-disposition")).toBe('inline; filename="basis.pdf"')
  })

  externalTest("executes a historical URL and an explicitly included deleted object", async () => {
    const [historical, deleted] = await Promise.all([
      withStorageDelta(0, () => readJson(
        `/v2/files/${readScenarios.files.versioned}/generate-download-url?projectVersion=2`,
      )),
      withStorageDelta(0, () => readJson(
        `/v2/files/${readScenarios.files.deleted}/generate-download-url?projectVersion=3&includeDeleted=true`,
      )),
    ])
    const historicalBody = parseReadContract(DownloadUrlSchema, historical.body)
    const deletedBody = parseReadContract(DownloadUrlSchema, deleted.body)
    const [historicalFile, deletedFile] = await Promise.all([
      fetch(historicalBody.downloadUrl),
      fetch(deletedBody.downloadUrl),
    ])

    expect(await historicalFile.text()).toBe(readScenarios.downloads.historicalBody)
    expect(await deletedFile.text()).toBe(readScenarios.downloads.deletedBody)
  })

  externalTest("snapshots unknown, wrong-version, excluded-deleted, absent-object, and pending states", async () => {
    const responses = await Promise.all([
      withStorageDelta(0, () => readJson(
        `/v2/files/${readScenarios.files.unknown}/generate-download-url?projectVersion=3`,
      )),
      withStorageDelta(0, () => readJson(
        `/v2/files/${readScenarios.files.versioned}/generate-download-url?projectVersion=1`,
      )),
      withStorageDelta(0, () => readJson(
        `/v2/files/${readScenarios.files.deleted}/generate-download-url?projectVersion=3`,
      )),
      withStorageDelta(0, () => readJson(
        `/v2/files/${readScenarios.files.missingObject}/generate-download-url?projectVersion=3`,
      )),
      withStorageDelta(0, () => readJson(
        `/v2/files/${readScenarios.files.pending}/generate-download-url?projectVersion=3`,
      )),
    ])

    expect(responses.map((response) => ({
      status: response.status,
      body: parseReadContract(ErrorResponseSchema, response.body),
    }))).toMatchSnapshot()
  })
})

interface UploadPayload {
  type: string
  projectId?: string
  filename: string
  createNewVersion?: boolean
  workflowId?: string
  runId?: string
}

const uploadRequest = (
  path: string,
  payload: UploadPayload,
  target: "primary" | "storage-failure" = "primary",
  headers: Record<string, string> = {},
) => readJson(path, {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(payload),
}, target)

const publicUpload = (
  payload: UploadPayload,
  version?: number,
  target: "primary" | "storage-failure" = "primary",
) => uploadRequest(
  `/v2/files/generate-upload-url${version === undefined ? "" : `?projectVersion=${version}`}`,
  payload,
  target,
)

const internalUpload = (
  payload: UploadPayload,
  version?: number,
  target: "primary" | "storage-failure" = "primary",
  headers: Record<string, string> = {},
) => uploadRequest(
  `/v2/internal/files/generate-upload-url${version === undefined ? "" : `?projectVersion=${version}`}`,
  payload,
  target,
  headers,
)

describe("POST /v2/files/generate-upload-url HTTP contract", () => {
  externalTest("returns meaningful document and ZIP signing inputs without persisting metadata", async () => {
    const project = readScenarios.projects.other
    const document = await withStorageDelta(0, () => publicUpload({
        type: "document",
        projectId: project.id,
        filename: readScenarios.uploads.freshFilename,
      }, project.latestVersion))
    const zip = await withStorageDelta(0, () => publicUpload({
        type: "zip",
        projectId: project.id,
        filename: readScenarios.uploads.zipFilename,
      }, project.latestVersion))
    const documentBody = parseReadContract(UploadUrlSchema, document.body)
    const zipBody = parseReadContract(UploadUrlSchema, zip.body)

    expect(document.status).toBe(200)
    expect(documentBody.mimeType).toBe("application/pdf")
    expect(signatureFields(documentBody.uploadUrl).path).toEndWith(
      `/qualification/documents/${project.id}/v1/${readScenarios.uploads.freshFilename}`,
    )
    expect(zipBody.mimeType).toBe("application/zip")
    expect(signatureFields(zipBody.uploadUrl).path).toEndWith(
      `/qualification/zips/${project.id}/v1/${readScenarios.uploads.zipFilename}`,
    )
  })

  externalTest("omitted version resolves from core project data", async () => {
    const response = await withStorageDelta(
      0,
      () => publicUpload({
        type: "document",
        projectId: readScenarios.projects.other.id,
        filename: readScenarios.uploads.freshFilename,
      }),
    )
    const body = parseReadContract(UploadUrlSchema, response.body)

    expect(response.status).toBe(200)
    expect(body.mimeType).toBe("application/pdf")
  })

  externalTest("executes an idempotent same-byte new-version PUT against real local storage", async () => {
    const project = readScenarios.projects.other
    const response = await withStorageDelta(0, () => publicUpload({
      type: "document",
      projectId: project.id,
      filename: readScenarios.uploads.roundTripFilename,
      createNewVersion: true,
    }, project.latestVersion))
    const body = parseReadContract(UploadUrlSchema, response.body)
    const signature = signatureFields(body.uploadUrl)
    const uploaded = await putSignedUrl(
      body.uploadUrl,
      readScenarios.uploads.roundTripBody,
      body.mimeType,
    )

    expect(signature.path).toEndWith(
      `/qualification/documents/${project.id}/v2/${readScenarios.uploads.roundTripFilename}`,
    )
    expect(uploaded.status).toBe(200)
  })

  externalTest("snapshots duplicate, invalid payload/name, lock, and storage failures", async () => {
    const base = {
      type: "document",
      projectId: readScenarios.projects.other.id,
      filename: readScenarios.uploads.roundTripFilename,
    }
    const responses = [
      await withStorageDelta(0, () =>
        publicUpload(base, 2)),
      await withStorageDelta(0, () =>
        publicUpload({ ...base, type: "content_extraction" }, 2)),
      await withStorageDelta(0, () =>
        publicUpload({ ...base, filename: readScenarios.uploads.invalidFilename }, 2)),
      await withStorageDelta(0, () =>
        publicUpload({ ...base, projectId: readScenarios.projects.locked.id }, 4)),
      await withStorageDelta(1, () =>
        publicUpload(
          { ...base, filename: readScenarios.uploads.freshFilename },
          2,
          "storage-failure",
        )),
      await withStorageDelta(0, () => publicUpload({
        ...base,
        projectId: readScenarios.projects.populated.id,
        filename: readScenarios.uploads.freshFilename,
      }, 3)),
    ] as const
    const [duplicate, invalidPayload, invalidName, lock, storage, activeApproval] =
      responses
    const stableErrors = [duplicate, invalidName, lock, activeApproval].map((response) => ({
      status: response.status,
      body: parseReadContract(ErrorResponseSchema, response.body),
    }))
    expect(stableErrors).toMatchSnapshot()
    expect(invalidPayload.status).toBe(422)
    expect(storage.status).toBe(500)
  })
})

describe("POST /v2/internal/files/generate-upload-url HTTP contract", () => {
  externalTest("signs public and internal file kinds with explicit and omitted versions", async () => {
    const project = readScenarios.projects.other
    const first = await withStorageDelta(0, () => internalUpload({
        type: "document",
        projectId: project.id,
        filename: readScenarios.uploads.freshFilename,
      }, project.latestVersion))
    const second = await withStorageDelta(0, () => internalUpload({
        type: "content_extraction",
        projectId: project.id,
        filename: readScenarios.uploads.internalFilename,
      }))
    const responses = [first, second]
    const bodies = responses.map((response) => parseReadContract(UploadUrlSchema, response.body))

    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect(bodies.map((body) => body.mimeType)).toEqual(["application/pdf", "application/json"])
    expect(signatureFields(bodies[1]!.uploadUrl).path).toContain("/content_extraction/")
  })

  externalTest("snapshots conflict, signing failure, forbidden Authorization, and malformed role inputs", async () => {
    const base = {
      type: "document",
      projectId: readScenarios.projects.other.id,
      filename: readScenarios.uploads.roundTripFilename,
    }
    const responses = [
      await withStorageDelta(0, () =>
        internalUpload(base, 2)),
      await withStorageDelta(1, () => internalUpload(
        { ...base, filename: readScenarios.uploads.freshFilename },
        2,
        "storage-failure",
      )),
      await withStorageDelta(0, () => internalUpload(
        { ...base, filename: readScenarios.uploads.freshFilename },
        2,
        "primary",
        { authorization: "Bearer service-token-must-not-be-forwarded" },
      )),
      await withStorageDelta(0, () => internalUpload(
        { ...base, filename: readScenarios.uploads.freshFilename },
        2,
        "primary",
        { authorization: "Bearer unexpected-user-role" },
      )),
    ]

    expect([responses[0]!, responses[2]!, responses[3]!].map((response) => ({
      status: response.status,
      body: parseReadContract(ErrorResponseSchema, response.body),
    }))).toMatchSnapshot()
    expect(responses[1]!.status).toBe(500)
  })
})
