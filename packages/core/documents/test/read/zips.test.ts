import { describe, expect, test } from "bun:test"
import { Elysia } from "elysia"

import { ZipListQuerySchema } from "../../src/schemas.ts"
import {
  ApprovalStatusSchema,
  ErrorResponseSchema,
  FileDiffSchema,
  ZipFileListSchema,
  ZipFileResponseSchema,
  parseReadContract,
} from "../support/read-contracts.ts"
import { externalTest, readJson } from "../support/external-app.ts"
import { readScenarios } from "../support/read-scenarios.ts"

describe("stored ZIP diff read contract", () => {
  externalTest("GET /v2/files/{file_id}/diff snapshots every nested diff branch", async () => {
    const response = await readJson(`/v2/files/${readScenarios.zips.versioned}/diff`)
    const body = parseReadContract(FileDiffSchema, response.body)

    expect(response.status).toBe(200)
    expect(Object.values(body).every((entries) => entries.length > 0)).toBe(true)
    expect({ status: response.status, body }).toMatchSnapshot()
  })

  externalTest("snapshots a ZIP with no stored diff and an unknown ZIP", async () => {
    const [empty, unknown] = await Promise.all([
      readJson(`/v2/files/${readScenarios.zips.emptyDiff}/diff`),
      readJson(`/v2/files/${readScenarios.zips.unknown}/diff`),
    ])

    expect({
      empty: { status: empty.status, body: parseReadContract(FileDiffSchema, empty.body) },
      unknown: {
        status: unknown.status,
        body: parseReadContract(ErrorResponseSchema, unknown.body),
      },
    }).toMatchSnapshot()
  })

  externalTest("internal diff snapshots found, historical-empty, wrong-project, wrong-version, and unknown", async () => {
    const path = (projectId: string, zipId: string, version: number) =>
      `/v2/internal/files/${projectId}/zips/${zipId}/diff?sourceVersion=${version}`
    const responses = await Promise.all([
      readJson(path(readScenarios.projects.populated.id, readScenarios.zips.versioned, 3)),
      readJson(path(readScenarios.projects.populated.id, readScenarios.zips.versioned, 2)),
      readJson(path(readScenarios.projects.other.id, readScenarios.zips.versioned, 3)),
      readJson(path(readScenarios.projects.populated.id, readScenarios.zips.versioned, 1)),
      readJson(path(readScenarios.projects.populated.id, readScenarios.zips.unknown, 3)),
    ])

    expect(responses.map((response, index) => ({
      status: response.status,
      body: index < 2
        ? parseReadContract(FileDiffSchema, response.body)
        : parseReadContract(ErrorResponseSchema, response.body),
    }))).toMatchSnapshot()
  })
})

describe("GET /v2/files/{file_id}/approval-status HTTP contract", () => {
  externalTest("snapshots representative approval states and unknown-id null", async () => {
    const ids = [
      readScenarios.zips.versioned,
      readScenarios.zips.emptyDiff,
      readScenarios.zips.failed,
      readScenarios.zips.rejected,
      readScenarios.zips.otherProject,
      readScenarios.zips.unknown,
    ]
    const responses = await Promise.all(ids.map((id) => readJson(`/v2/files/${id}/approval-status`)))

    expect(responses.map((response) => ({
      status: response.status,
      body: parseReadContract(ApprovalStatusSchema, response.body),
    }))).toMatchSnapshot()
  })
})

const listZips = (query: Record<string, string>) =>
  readJson(`/v2/zip-files?${new URLSearchParams(query)}`)

describe("GET /v2/zip-files HTTP contract", () => {
  test("keeps the workflow status filter absent when the caller omits it", async () => {
    const app = new Elysia().get("/", ({ query }) => query, { query: ZipListQuerySchema })
    const [unfiltered, filtered] = await Promise.all([
      app.handle(new Request("http://document-management.invalid/?projectVersion=3")),
      app.handle(
        new Request(
          "http://document-management.invalid/?projectVersion=3&workflowStatus=COMPLETED",
        ),
      ),
    ])

    expect(await unfiltered.json()).toEqual({ projectVersion: 3 })
    expect(await filtered.json()).toEqual({ projectVersion: 3, workflowStatus: "COMPLETED" })
  })

  externalTest("snapshots populated, empty, project, workflow, type, and combined filters", async () => {
    const base = { projectVersion: "3" }
    const cases = {
      populated: base,
      empty: { projectVersion: "1", projectId: readScenarios.projects.empty.id },
      project: { ...base, projectId: readScenarios.projects.populated.id },
      workflow: { ...base, workflowStatus: "FAILED" },
      type: { ...base, fileType: "ewms_zip" },
      combined: {
        ...base,
        projectId: readScenarios.projects.populated.id,
        workflowStatus: "COMPLETED",
        fileType: "zip",
      },
    }
    const entries = await Promise.all(Object.entries(cases).map(async ([name, query]) => {
      const response = await listZips(query)
      return [name, {
        status: response.status,
        body: parseReadContract(ZipFileListSchema, response.body),
      }] as const
    }))

    expect(Object.fromEntries(entries)).toMatchSnapshot()
  })

  externalTest("snapshots versions and first, middle, and empty pages", async () => {
    const responses = await Promise.all([
      listZips({ projectVersion: "2", projectId: readScenarios.projects.populated.id }),
      listZips({ projectVersion: "3", page: "1", pageSize: "2" }),
      listZips({ projectVersion: "3", page: "2", pageSize: "2" }),
      listZips({ projectVersion: "3", page: "99", pageSize: "2" }),
    ])

    expect(responses.map((response) => ({
      status: response.status,
      body: parseReadContract(ZipFileListSchema, response.body),
    }))).toMatchSnapshot()
  })

  externalTest("asserts invalid version, filter, and pagination semantics", async () => {
    const responses = await Promise.all([
      listZips({ projectVersion: "0" }),
      listZips({ projectVersion: "3", workflowStatus: "BOGUS" }),
      listZips({ projectVersion: "3", fileType: "document" }),
      listZips({ projectVersion: "3", page: "0" }),
    ])
    expect(responses.map(({ status }) => status)).toEqual([422, 422, 422, 422])
  })
})

describe("GET /v2/zip-files/{zip_file_id} HTTP contract", () => {
  externalTest("snapshots latest, explicit current, and explicit historical rows", async () => {
    const responses = await Promise.all([
      readJson(`/v2/zip-files/${readScenarios.zips.versioned}`),
      readJson(`/v2/zip-files/${readScenarios.zips.versioned}?projectVersion=3`),
      readJson(`/v2/zip-files/${readScenarios.zips.versioned}?projectVersion=2`),
    ])

    expect(responses.map((response) => ({
      status: response.status,
      body: parseReadContract(ZipFileResponseSchema, response.body),
    }))).toMatchSnapshot()
  })

  externalTest("snapshots absent responses and asserts invalid version semantics", async () => {
    const responses = await Promise.all([
      readJson(`/v2/zip-files/${readScenarios.zips.unknown}`),
      readJson(`/v2/zip-files/${readScenarios.zips.versioned}?projectVersion=1`),
      readJson(`/v2/zip-files/${readScenarios.zips.versioned}?projectVersion=0`),
    ])
    const absent = responses.slice(0, 2).map((response) => ({
      status: response.status,
      body: parseReadContract(ErrorResponseSchema, response.body),
    }))

    expect(absent).toMatchSnapshot()
    expect(responses[2]!.status).toBe(422)
  })
})
