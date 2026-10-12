export type TableFilterScalar = string | number | bigint | boolean | Date;

type OrderedTableFilterScalar = Exclude<TableFilterScalar, boolean>;
type Present<Value> = Exclude<Value, null | undefined>;

export type TableFilterField<Row extends object> = {
  [Field in keyof Row & string]-?: [Present<Row[Field]>] extends [never]
    ? never
    : Present<Row[Field]> extends TableFilterScalar
      ? Field
      : never;
}[keyof Row & string];

type EqualityFilter<Row extends object, Field extends TableFilterField<Row>> =
  Field extends TableFilterField<Row>
    ? Readonly<{
        kind: "eq" | "ne";
        field: Field;
        value: Present<Row[Field]>;
      }>
    : never;

type OrderFilter<Row extends object, Field extends TableFilterField<Row>> =
  Field extends TableFilterField<Row>
    ? Present<Row[Field]> extends OrderedTableFilterScalar
      ? Readonly<{
          kind: "gt" | "gte" | "lt" | "lte";
          field: Field;
          value: Present<Row[Field]>;
        }>
      : never
    : never;

type MembershipFilter<Row extends object, Field extends TableFilterField<Row>> =
  Field extends TableFilterField<Row>
    ? Readonly<{
        kind: "in" | "not-in";
        field: Field;
        values: readonly [Present<Row[Field]>, ...Present<Row[Field]>[]];
      }>
    : never;

type PresenceFilter<Row extends object, Field extends TableFilterField<Row>> =
  Field extends TableFilterField<Row>
    ? null extends Row[Field]
      ? Readonly<{ kind: "present" | "absent"; field: Field }>
      : undefined extends Row[Field]
        ? Readonly<{ kind: "present" | "absent"; field: Field }>
        : never
    : never;

type FieldFilter<Row extends object, Fields extends TableFilterField<Row>> =
  | EqualityFilter<Row, Fields>
  | OrderFilter<Row, Fields>
  | MembershipFilter<Row, Fields>
  | PresenceFilter<Row, Fields>;

export type TableFilter<
  Row extends object,
  Fields extends TableFilterField<Row> = TableFilterField<Row>,
> =
  | FieldFilter<Row, Fields>
  | Readonly<{
      kind: "and" | "or";
      filters: readonly [TableFilter<Row, Fields>, ...TableFilter<Row, Fields>[]];
    }>
  | Readonly<{ kind: "not"; filter: TableFilter<Row, Fields> }>;

export interface TableResourceQuery<
  Row extends object,
  FilterFields extends TableFilterField<Row>,
> {
  readonly where?: TableFilter<Row, FilterFields>;
}

export interface TableResourcePaginationArgs<
  Row extends object,
  FilterFields extends TableFilterField<Row>,
> extends TableResourceQuery<Row, FilterFields> {
  readonly limit?: number;
  readonly skip?: number;
}

export interface TableResourcePagination<Row> {
  readonly data: readonly Row[];
  readonly pagination: Readonly<{
    count: number;
    hasNext: boolean;
    hasPrevious: boolean;
  }>;
}

export interface TableResourceBatchResult<Row> {
  readonly count: number;
  readonly data?: readonly Row[];
}

export type TableResourceThrowingResult<Row> = Promise<Row | null> & {
  throw(error?: () => unknown): Promise<Row>;
};

type UpsertManyUpdate<Changes> = "all" | readonly (keyof Changes & string)[] | Readonly<Changes>;

type UpdateEachRow<Row extends object> = Readonly<Partial<Row>>;

type UpdateEachMap<Row extends object, Changes> = Readonly<
  Partial<{
    [Field in keyof Changes & string]: (
      row: UpdateEachRow<Row>,
    ) => Exclude<Changes[Field], undefined>;
  }>
>;

export interface LiveTableResource<
  Row extends object,
  Create,
  Changes,
  Identity extends object,
  FilterFields extends TableFilterField<Row>,
> {
  count(query?: TableResourceQuery<Row, FilterFields>): Promise<number>;
  exists(query?: TableResourceQuery<Row, FilterFields>): Promise<boolean>;
  create(args: Readonly<{ data: Create }>): Promise<Row>;
  createMany(args: Readonly<{ data: readonly Create[] }>): Promise<TableResourceBatchResult<Row>>;
  upsert(args: Readonly<{ where: Identity; create: Create; update: Changes }>): Promise<Row>;
  upsertMany(
    args: Readonly<{
      data: readonly Create[];
      update: UpsertManyUpdate<Changes>;
      batchSize?: number;
    }>,
  ): Promise<TableResourceBatchResult<Row>>;
  findOne(query?: TableResourceQuery<Row, FilterFields>): TableResourceThrowingResult<Row>;
  findFirst(query?: TableResourceQuery<Row, FilterFields>): TableResourceThrowingResult<Row>;
  findUnique(args: Readonly<{ where: Identity }>): TableResourceThrowingResult<Row>;
  findMany(query?: TableResourceQuery<Row, FilterFields>): Promise<readonly Row[]>;
  paginate(
    args: TableResourcePaginationArgs<Row, FilterFields>,
  ): Promise<TableResourcePagination<Row>>;
  update(args: Readonly<{ where: Identity; data: Changes }>): TableResourceThrowingResult<Row>;
  updateMany(
    args: TableResourceQuery<Row, FilterFields> & Readonly<{ data: Changes }>,
  ): Promise<TableResourceBatchResult<Row>>;
  updateEach(
    args: Readonly<{
      by: TableFilterField<Row>;
      data: readonly UpdateEachRow<Row>[];
      update: UpdateEachMap<Row, Changes>;
      where?: TableFilter<Row, FilterFields>;
      onEmpty?: "return" | "throw";
    }>,
  ): Promise<TableResourceBatchResult<Row>>;
  delete(args: Readonly<{ where: Identity }>): TableResourceThrowingResult<Row>;
  deleteMany(query: TableResourceQuery<Row, FilterFields>): Promise<TableResourceBatchResult<Row>>;
}
