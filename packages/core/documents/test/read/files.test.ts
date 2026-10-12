import { describe, expect } from "bun:test"

import {
  ErrorResponseSchema,
  FileListSchema,
  FileResponseSchema,
  parseReadContract,
} from "../support/read-contracts.ts"
import { externalTest, readJson } from "../support/external-app.ts"
import { readScenarios } from "../support/read-scenarios.ts"

const filePath = (fileId: string, projectVersion: number) =>
  `/v2/files/${fileId}?projectVersion=${projectVersion}`

describe("GET /v2/files/{file_id} HTTP contract", () => {
  externalTest("snapshots the current versioned file and its topic projection", async () => {
    const response = await readJson(filePath(readScenarios.files.versioned, 3))
    const body = parseReadContract(FileResponseSchema, response.body)

    expect(response.status).toBe(200)
    expect(body.projectVersion).toBe(3)
    expect(body.isDeleted).toBe(false)
    expect({ status: response.status, body }).toMatchSnapshot()
  })

  externalTest("snapshots the same logical file at its historical project version", async () => {
    const response = await readJson(filePath(readScenarios.files.versioned, 2))
    const body = parseReadContract(FileResponseSchema, response.body)

    expect(body.projectVersion).toBe(2)
    expect({ status: response.status, body }).toMatchSnapshot()
  })

  for (const [name, fileId, version] of [
    ["unknown id", readScenarios.files.unknown, 3],
    ["unknown project version", readScenarios.files.versioned, 1],
    ["soft-deleted row", readScenarios.files.deleted, 3],
  ] as const) {
    externalTest(`snapshots ${name}`, async () => {
      const response = await readJson(filePath(fileId, version))
      const body = parseReadContract(ErrorResponseSchema, response.body)

      expect({ status: response.status, body }).toMatchSnapshot()
    })
  }
})

describe("GET /v2/files/{file_id}/versions HTTP contract", () => {
  externalTest("snapshots all versions in visible incumbent order without crossing projects", async () => {
    const response = await readJson(`/v2/files/${readScenarios.files.versioned}/versions`)
    const body = parseReadContract(FileListSchema, response.body)

    expect(response.status).toBe(200)
    expect(body.map((file) => file.projectVersion)).toEqual([3, 2])
    expect(body.map((file) => file.projectId)).not.toContain(readScenarios.projects.other.id)
    expect({ status: response.status, body }).toMatchSnapshot()
  })

  externalTest("snapshots the absent-id response", async () => {
    const response = await readJson(`/v2/files/${readScenarios.files.unknown}/versions`)
    const body = parseReadContract(ErrorResponseSchema, response.body)

    expect({ status: response.status, body }).toMatchSnapshot()
  })
})

const listFiles = (query: Record<string, string | string[]>) => {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    for (const item of Array.isArray(value) ? value : [value]) search.append(key, item)
  }
  return readJson(`/v2/files?${search}`)
}

describe("GET /v2/files HTTP contract", () => {
  externalTest("snapshots a populated project/version and excludes deleted and other-project rows", async () => {
    const response = await listFiles({
      fileType: "document",
      projectVersion: "3",
      projectId: readScenarios.projects.populated.id,
    })
    const body = parseReadContract(FileListSchema, response.body)

    expect(body.map((file) => file.id)).not.toContain(readScenarios.files.deleted)
    expect(body.map((file) => file.id)).not.toContain(readScenarios.files.otherProject)
    expect({ status: response.status, body }).toMatchSnapshot()
  })

  externalTest("snapshots an empty project/version", async () => {
    const response = await listFiles({
      fileType: "document",
      projectVersion: "1",
      projectId: readScenarios.projects.empty.id,
    })
    const body = parseReadContract(FileListSchema, response.body)

    expect({ status: response.status, body }).toMatchSnapshot()
  })

  externalTest("snapshots name, path, topic, and deleted filters alone and combined", async () => {
    const base = {
      fileType: "document",
      projectVersion: "3",
      projectId: readScenarios.projects.populated.id,
    }
    const cases = {
      name: { ...base, name: "ALPHA" },
      path: { ...base, path: "/reports/" },
      topic: { ...base, topicIds: readScenarios.topics.environment },
      combined: {
        ...base,
        name: "alpha",
        path: "/reports/",
        topicIds: readScenarios.topics.environment,
      },
      deleted: { ...base, includeDeleted: "true", name: "deleted" },
    }
    const entries = await Promise.all(
      Object.entries(cases).map(async ([name, query]) => {
        const response = await listFiles(query)
        return [name, {
          status: response.status,
          body: parseReadContract(FileListSchema, response.body),
        }] as const
      }),
    )

    expect(Object.fromEntries(entries)).toMatchSnapshot()
  })

  externalTest("snapshots historical and another-project isolation", async () => {
    const entries = await Promise.all([
      listFiles({
        fileType: "document",
        projectVersion: "2",
        projectId: readScenarios.projects.populated.id,
      }),
      listFiles({
        fileType: "document",
        projectVersion: "2",
        projectId: readScenarios.projects.other.id,
      }),
    ])

    expect(entries.map((response) => ({
      status: response.status,
      body: parseReadContract(FileListSchema, response.body),
    }))).toMatchSnapshot()
  })

  externalTest("snapshots first, middle, and empty pages", async () => {
    const base = {
      fileType: "document",
      projectVersion: "3",
      projectId: readScenarios.projects.populated.id,
      pageSize: "2",
    }
    const pages = await Promise.all(["1", "2", "99"].map((page) => listFiles({ ...base, page })))

    expect(pages.map((response) => ({
      status: response.status,
      body: parseReadContract(FileListSchema, response.body),
    }))).toMatchSnapshot()
  })

  externalTest("asserts invalid enum, version, and page query semantics", async () => {
    const responses = await Promise.all([
      listFiles({ fileType: "unknown", projectVersion: "3" }),
      listFiles({ fileType: "document", projectVersion: "0" }),
      listFiles({ fileType: "document", projectVersion: "3", page: "0" }),
    ])
    expect(responses.map(({ status }) => status)).toEqual([422, 422, 422])
  })
})
