import { better } from "better-drizzle";
import {
  and,
  eq,
  getTableColumns,
  gt,
  gte,
  inArray,
  is,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  not,
  notInArray,
  or,
  type InferInsertModel,
  type InferSelectModel,
  type SQL,
} from "drizzle-orm";
import type { AnyPgTable, PgColumn } from "drizzle-orm/pg-core";
import { getTableConfig, IndexedColumn } from "drizzle-orm/pg-core";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core/query-builders/update";
import {
  type LiveTableResource,
  type Resource,
  type TableFilter,
  type TableFilterField,
  type TableResourceQuery,
  type TableResourceThrowingResult,
} from "@spark-workflow/resource";

import { PostgreSQL } from "./resource";
import type { PostgresQueryClient, PostgresSchema, PostgreSQLService } from "./runtime";

type TableColumnKey<Table extends AnyPgTable> = Extract<keyof Table["_"]["columns"], string>;
type TableRow<Table extends AnyPgTable> = InferSelectModel<Table>;
type TableCreate<Table extends AnyPgTable> = InferInsertModel<Table>;
type PlainUpdateSet<Table extends AnyPgTable> = {
  [Field in keyof PgUpdateSetSource<Table>]?: Exclude<
    PgUpdateSetSource<Table>[Field],
    PgColumn | SQL | undefined
  >;
};

type RequiredTableField<Row extends object> = {
  [Field in keyof Row & string]-?: null extends Row[Field]
    ? never
    : undefined extends Row[Field]
      ? never
      : Field;
}[keyof Row & string];

type TableIdentityField<Table extends AnyPgTable> = Extract<
  TableColumnKey<Table>,
  RequiredTableField<TableRow<Table>>
>;

type TableResourceFilterField<Table extends AnyPgTable> = Extract<
  TableColumnKey<Table>,
  TableFilterField<TableRow<Table>>
>;

export type PostgresTableResource<
  Table extends AnyPgTable,
  IdentityFields extends TableIdentityField<Table>,
  FilterFields extends TableResourceFilterField<Table>,
> = LiveTableResource<
  TableRow<Table>,
  Readonly<TableCreate<Table>>,
  Readonly<Omit<PlainUpdateSet<Table>, IdentityFields>>,
  Readonly<Pick<TableRow<Table>, IdentityFields>>,
  FilterFields
>;

type IdentityTuple<Table extends AnyPgTable> = readonly [
  TableIdentityField<Table>,
  ...TableIdentityField<Table>[],
];

interface PostgresTableProviderOptions<
  Id extends string,
  Table extends AnyPgTable,
  Identity extends IdentityTuple<Table>,
  FilterFields extends readonly TableResourceFilterField<Table>[],
  Schema extends PostgresSchema,
> {
  readonly resource: Resource<
    Id,
    PostgresTableResource<Table, Identity[number], FilterFields[number]>
  >;
  readonly schema: Schema;
  readonly table: Table;
  readonly identity: Identity;
  readonly filterFields: FilterFields;
}

const combine = (kind: "and" | "or", conditions: readonly SQL[]): SQL => {
  const condition = kind === "and" ? and(...conditions) : or(...conditions);
  if (condition === undefined) throw new TypeError(`A '${kind}' filter cannot be empty`);
  return condition;
};

const throwingResult = <Row>(
  promise: Promise<Row | null>,
  operation: string,
): TableResourceThrowingResult<Row> =>
  Object.assign(promise, {
    async throw(
      error: () => unknown = () => new Error(`Table Resource ${operation} found no row`),
    ) {
      const row = await promise;
      if (row === null) throw error();
      return row;
    },
  });

type SqlQuery = Readonly<{ where?: SQL }>;

type BetterTableAdapterModel<
  Row extends object,
  Create,
  Changes,
  Identity extends object,
  FilterFields extends TableFilterField<Row>,
  Service extends LiveTableResource<Row, Create, Changes, Identity, FilterFields> =
    LiveTableResource<Row, Create, Changes, Identity, FilterFields>,
> = Pick<Service, "create" | "createMany" | "update" | "delete"> & {
  upsertMany(
    args: Readonly<{
      data: readonly Create[];
      target: (keyof Identity & string) | readonly (keyof Identity & string)[];
      update: Parameters<Service["upsertMany"]>[0]["update"];
      batchSize?: number;
    }>,
  ): ReturnType<Service["upsertMany"]>;
  count(query?: SqlQuery): ReturnType<Service["count"]>;
  exists(query?: SqlQuery): ReturnType<Service["exists"]>;
  findOne(query?: SqlQuery): TableResourceThrowingResult<Row>;
  findFirst(query?: SqlQuery): TableResourceThrowingResult<Row>;
  findUnique(args: Parameters<Service["findUnique"]>[0]): TableResourceThrowingResult<Row>;
  findMany(query?: SqlQuery): Promise<readonly Row[]>;
  paginate(
    query: SqlQuery & Readonly<{ limit?: number; skip?: number }>,
  ): ReturnType<Service["paginate"]>;
  updateMany(
    args: SqlQuery & Readonly<{ data: Parameters<Service["updateMany"]>[0]["data"] }>,
  ): ReturnType<Service["updateMany"]>;
  updateEach(
    args: Omit<Parameters<Service["updateEach"]>[0], "by" | "where"> &
      Readonly<{ by: PgColumn; where?: SQL }>,
  ): ReturnType<Service["updateEach"]>;
  deleteMany(query: SqlQuery): ReturnType<Service["deleteMany"]>;
};

function assertUniqueIdentity<Table extends AnyPgTable>(
  table: Table,
  identity: readonly TableColumnKey<Table>[],
): void {
  const columns = getTableColumns(table);
  const propertyByName = new Map(
    Object.entries(columns).map(([property, column]) => [column.name, property]),
  );
  const property = (column: PgColumn) => propertyByName.get(column.name);
  const indexedProperty = (column: Partial<IndexedColumn | SQL>) =>
    is(column, IndexedColumn) && column.name !== undefined
      ? propertyByName.get(column.name)
      : undefined;
  const config = getTableConfig(table);
  const inline = config.columns.filter((column) => column.primary).map(property);
  const declared = config.primaryKeys.map((key) => key.columns.map(property));
  const uniqueColumns = config.columns
    .filter((column) => column.isUnique)
    .map((column) => [property(column)]);
  const uniqueConstraints = config.uniqueConstraints.map((constraint) =>
    constraint.columns.map(property),
  );
  const uniqueIndexes = config.indexes
    .filter((index) => index.config.unique && index.config.where === undefined)
    .map((index) => index.config.columns.map(indexedProperty));
  const keys = [
    inline,
    ...declared,
    ...uniqueColumns,
    ...uniqueConstraints,
    ...uniqueIndexes,
  ].filter((key) => key.length > 0);
  const matches = keys.some(
    (key) =>
      key.length === identity.length &&
      key.every((field, index) => field !== undefined && field === identity[index]),
  );
  if (!matches) {
    throw new TypeError(
      `Table Resource identity for '${config.name}' must exactly match a primary or unique key`,
    );
  }
}

export function providePostgresTable<
  const Id extends string,
  Table extends AnyPgTable,
  const Identity extends IdentityTuple<Table>,
  const FilterFields extends readonly TableResourceFilterField<Table>[],
  const Schema extends PostgresSchema,
>(options: PostgresTableProviderOptions<Id, Table, Identity, FilterFields, Schema>) {
  type Row = TableRow<Table>;
  type Create = Readonly<TableCreate<Table>>;
  type Changes = Readonly<Omit<PlainUpdateSet<Table>, Identity[number]>>;
  type IdentityValue = Readonly<Pick<Row, Identity[number]>>;
  type Filter = TableFilter<Row, FilterFields[number]>;
  type Query = TableResourceQuery<Row, FilterFields[number]>;
  type Service = PostgresTableResource<Table, Identity[number], FilterFields[number]>;

  const table = options.table;
  const columns = getTableColumns(table);
  const filterFields = new Set<string>(options.filterFields);
  const column = (field: string) => {
    const value = columns[field];
    if (value === undefined) throw new TypeError(`Unknown table field '${field}'`);
    return value;
  };
  const filterColumn = (field: string) => {
    if (!filterFields.has(field)) {
      throw new TypeError(`Table Resource filter field '${field}' is not enabled`);
    }
    return column(field);
  };
  const filterCondition = (filter: Filter): SQL => {
    switch (filter.kind) {
      case "eq":
        return eq(filterColumn(filter.field), filter.value);
      case "ne":
        return ne(filterColumn(filter.field), filter.value);
      case "gt":
        return gt(filterColumn(filter.field), filter.value);
      case "gte":
        return gte(filterColumn(filter.field), filter.value);
      case "lt":
        return lt(filterColumn(filter.field), filter.value);
      case "lte":
        return lte(filterColumn(filter.field), filter.value);
      case "in":
        return inArray(filterColumn(filter.field), filter.values);
      case "not-in":
        return notInArray(filterColumn(filter.field), [...filter.values]);
      case "present":
        return isNotNull(filterColumn(filter.field));
      case "absent":
        return isNull(filterColumn(filter.field));
      case "and":
      case "or":
        return combine(filter.kind, filter.filters.map(filterCondition));
      case "not":
        return not(filterCondition(filter.filter));
      default: {
        const exhaustive: never = filter;
        return exhaustive;
      }
    }
  };
  const where = (query: Query | undefined): SQL | undefined =>
    query?.where === undefined ? undefined : filterCondition(query.where);

  assertUniqueIdentity(table, options.identity);
  if (!Object.values(options.schema).includes(table)) {
    throw new TypeError("Table Resource table must belong to its PostgreSQL schema");
  }

  const make = (postgres: PostgreSQLService): Service => {
    const scope = postgres.scope(options.schema);
    const modelSchema = { table };
    type Model = BetterTableAdapterModel<
      Row,
      Create,
      Changes,
      IdentityValue,
      FilterFields[number],
      Service
    >;
    const model = (database: PostgresQueryClient<Schema>): Model => {
      const client: unknown = better(database, { schema: modelSchema });
      return (client as Readonly<{ table: Model }>).table;
    };
    const run = <Result>(callback: (model: Model) => Promise<Result>): Promise<Result> =>
      scope.query((database) => callback(model(database)));
    const first = (query: Query | undefined, operation: string) =>
      throwingResult(
        run((model) => model.findFirst({ where: where(query) })),
        operation,
      );

    return {
      count: (query) => run((model) => model.count({ where: where(query) })),
      exists: (query) => run((model) => model.exists({ where: where(query) })),
      create: ({ data }) => run((model) => model.create({ data })),
      createMany: ({ data }) => run((model) => model.createMany({ data: [...data] })),
      upsert: ({ where: identity, create, update }) =>
        run(async (model) => {
          const result = await model.upsertMany({
            data: [{ ...create, ...identity }],
            target: options.identity,
            update,
          });
          const row = result.data?.[0];
          if (row === undefined)
            throw new Error("PostgreSQL did not return the upserted Resource row");
          return row;
        }),
      upsertMany: ({ data, update, batchSize }) =>
        run((model) =>
          model.upsertMany({
            data: [...data],
            target: options.identity,
            update,
            batchSize,
          }),
        ),
      findOne: (query) => first(query, "findOne"),
      findFirst: (query) => first(query, "findFirst"),
      findUnique: ({ where: identity }) =>
        throwingResult(
          run((model) => model.findUnique({ where: identity })),
          "findUnique",
        ),
      findMany: (query) => run((model) => model.findMany({ where: where(query) })),
      paginate: (query) =>
        run(async (model) => {
          const page = await model.paginate({
            where: where(query),
            limit: query.limit,
            skip: query.skip,
          });
          const skip = query.skip ?? 0;
          return {
            ...page,
            pagination: {
              count: page.pagination.count,
              hasNext: skip + page.data.length < page.pagination.count,
              hasPrevious: skip > 0,
            },
          };
        }),
      update: ({ where: identity, data }) =>
        throwingResult(
          run((model) => model.update({ where: identity, data })),
          "update",
        ),
      updateMany: ({ data, ...query }) =>
        run((model) => model.updateMany({ where: where(query), data })),
      updateEach: ({ by, data, update, where: filter, onEmpty }) =>
        run((model) =>
          model.updateEach({
            by: column(by),
            data: [...data],
            update,
            where: filter === undefined ? undefined : filterCondition(filter),
            onEmpty,
          }),
        ),
      delete: ({ where: identity }) =>
        throwingResult(
          run((model) => model.delete({ where: identity })),
          "delete",
        ),
      deleteMany: (query) => run((model) => model.deleteMany({ where: where(query) })),
    };
  };

  return Object.freeze({
    resource: options.resource,
    needs: { postgres: PostgreSQL },
    make: ({ postgres }: { readonly postgres: PostgreSQLService }) => make(postgres),
  });
}
