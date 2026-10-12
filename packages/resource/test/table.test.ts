import { describe, expect, test } from "bun:test";

import type {
  LiveTableResource,
  TableFilter,
  TableFilterField,
  TableResourceBatchResult,
  TableResourcePagination,
  TableResourceThrowingResult,
} from "../src/index.ts";

interface ProjectRow {
  id: string;
  name: string;
  active: boolean;
  createdAt: Date;
  archivedAt: Date | null;
  metadata: Readonly<{ source: string }>;
  tags: readonly string[];
}

type ProjectFilterField = TableFilterField<ProjectRow>;
type ProjectFilter = TableFilter<ProjectRow, ProjectFilterField>;
type ProjectResource = LiveTableResource<
  ProjectRow,
  Readonly<{ id: string; name: string; active?: boolean }>,
  Readonly<{ name?: string; active?: boolean }>,
  Readonly<{ id: string }>,
  "id" | "name" | "active"
>;

const acceptedFilter: ProjectFilter = {
  kind: "and",
  filters: [
    { kind: "eq", field: "active", value: true },
    { kind: "gte", field: "createdAt", value: new Date(0) },
    { kind: "in", field: "id", values: ["first", "second"] },
    { kind: "absent", field: "archivedAt" },
  ],
};

const compileContract = (resource: ProjectResource) => {
  const one: TableResourceThrowingResult<ProjectRow> = resource.findOne({
    where: { kind: "eq", field: "name", value: "Ada" },
  });
  const first: TableResourceThrowingResult<ProjectRow> = resource.findFirst();
  const unique: TableResourceThrowingResult<ProjectRow> = resource.findUnique({
    where: { id: "one" },
  });
  const many: Promise<readonly ProjectRow[]> = resource.findMany();
  const created: Promise<ProjectRow> = resource.create({
    data: { id: "one", name: "Ada" },
  });
  const createdMany: Promise<TableResourceBatchResult<ProjectRow>> = resource.createMany({
    data: [{ id: "two", name: "Grace" }],
  });
  const upserted: Promise<ProjectRow> = resource.upsert({
    where: { id: "one" },
    create: { id: "one", name: "Ada" },
    update: { name: "Grace" },
  });
  const upsertedMany: Promise<TableResourceBatchResult<ProjectRow>> = resource.upsertMany({
    data: [{ id: "one", name: "Ada" }],
    update: ["name"],
  });
  const updated: TableResourceThrowingResult<ProjectRow> = resource.update({
    where: { id: "one" },
    data: { name: "Grace" },
  });
  const updatedMany: Promise<TableResourceBatchResult<ProjectRow>> = resource.updateMany({
    where: { kind: "eq", field: "active", value: true },
    data: { active: false },
  });
  const updatedEach: Promise<TableResourceBatchResult<ProjectRow>> = resource.updateEach({
    by: "id",
    data: [{ id: "one", name: "Grace" }],
    update: { name: (row) => String(row.name) },
  });
  const deleted: TableResourceThrowingResult<ProjectRow> = resource.delete({
    where: { id: "one" },
  });
  const deletedMany: Promise<TableResourceBatchResult<ProjectRow>> = resource.deleteMany({});
  const count: Promise<number> = resource.count();
  const exists: Promise<boolean> = resource.exists();
  const page: Promise<TableResourcePagination<ProjectRow>> = resource.paginate({ limit: 20 });
  return {
    count,
    created,
    createdMany,
    deleted,
    deletedMany,
    exists,
    first,
    many,
    one,
    page,
    unique,
    updated,
    updatedEach,
    updatedMany,
    upserted,
    upsertedMany,
  };
};

describe("live table Resource contract", () => {
  test("types the complete fixed-row operation set", () => {
    expect(acceptedFilter.filters).toHaveLength(4);
    expect(compileContract).toBeFunction();

    // @ts-expect-error object fields cannot be filtered by the standard AST
    const objectFilter: ProjectFilter = { kind: "eq", field: "metadata", value: {} };
    // @ts-expect-error arrays cannot use Mongo-style membership operators
    const arrayFilter: ProjectFilter = { kind: "eq", field: "tags", value: [] };
    // @ts-expect-error boolean ordering has no standard semantics
    const booleanOrder: ProjectFilter = { kind: "gt", field: "active", value: true };
    // @ts-expect-error membership must contain at least one value
    const emptyMembership: ProjectFilter = { kind: "in", field: "id", values: [] };
    expect([objectFilter, arrayFilter, booleanOrder, emptyMembership]).toHaveLength(4);
  });
});
