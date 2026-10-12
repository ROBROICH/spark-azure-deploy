import { Buffer } from "node:buffer";

import { Type, type TSchema } from "@sinclair/typebox";
import { t } from "elysia";

const paginationParameters = ["limit", "page", "cursor"];

export const RestPaginationQueryProperties = {
  limit: Type.Optional(t.Numeric({ minimum: 1, maximum: 200, multipleOf: 1 })),
  page: Type.Optional(t.Numeric({ minimum: 1, multipleOf: 1 })),
  cursor: Type.Optional(
    Type.String({ minLength: 2, maxLength: 22, pattern: "^[A-Za-z0-9_-]+$" }),
  ),
};

export const RestQueryErrorSchema = Type.Object(
  { detail: Type.String({ minLength: 1 }) },
  { additionalProperties: false },
);

export const restPageResponseSchema = <Item extends TSchema>(item: Item) =>
  Type.Object(
    {
      data: Type.Array(item),
      pagination: Type.Object(
        {
          page: Type.Integer({ minimum: 1 }),
          limit: Type.Integer({ minimum: 1, maximum: 200 }),
          total: Type.Integer({ minimum: 0 }),
          nextCursor: Type.Union([Type.String(), Type.Null()]),
        },
        { additionalProperties: false },
      ),
    },
    { additionalProperties: false },
  );

export class InvalidRestQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidRestQueryError";
  }
}

export interface RestPaginationQuery {
  readonly cursor?: string;
  readonly limit?: number;
  readonly page?: number;
}

export interface RestPagination {
  readonly limit: number;
  readonly offset: number;
  readonly page: number;
}

export interface RestPaginationMetadata {
  readonly limit: number;
  readonly nextCursor: string | null;
  readonly page: number;
  readonly total: number;
}

export function assertRestQuery(
  request: Request,
  parameters: Readonly<{
    single?: readonly string[];
    repeated?: readonly string[];
  }> = {},
): void {
  const search = new URL(request.url).searchParams;
  const single = parameters.single ?? [];
  const allowed = new Set([...single, ...(parameters.repeated ?? [])]);
  const unknown = [...new Set(search.keys())].filter((name) => !allowed.has(name));
  if (unknown.length > 0) {
    throw new InvalidRestQueryError(
      `Unknown query parameter${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}`,
    );
  }

  const duplicated = single.filter((name) => search.getAll(name).length > 1);
  if (duplicated.length > 0) {
    throw new InvalidRestQueryError(
      `Query parameter${duplicated.length === 1 ? "" : "s"} must occur once: ${duplicated.join(", ")}`,
    );
  }
}

const encodeCursor = (offset: number): string =>
  Buffer.from(String(offset)).toString("base64url");

const decodeCursor = (cursor: string): number | undefined => {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  if (!/^(0|[1-9][0-9]*)$/.test(raw)) return undefined;
  const offset = Number(raw);
  return Number.isSafeInteger(offset) && encodeCursor(offset) === cursor
    ? offset
    : undefined;
};

export function parseRestPagination(
  request: Request,
  query: RestPaginationQuery,
  filterParameters: readonly string[] = [],
  singleParameters: readonly string[] = [],
): RestPagination {
  assertRestQuery(request, {
    single: [...paginationParameters, ...singleParameters],
    repeated: filterParameters,
  });
  if (query.page !== undefined && query.cursor !== undefined) {
    throw new InvalidRestQueryError("Use either page or cursor, not both");
  }

  const limit = query.limit ?? 50;
  const offset =
    query.cursor === undefined ? ((query.page ?? 1) - 1) * limit : decodeCursor(query.cursor);
  if (offset === undefined || !Number.isSafeInteger(offset) || offset > Number.MAX_SAFE_INTEGER - limit) {
    throw new InvalidRestQueryError("Invalid cursor or page");
  }
  return { limit, offset, page: Math.floor(offset / limit) + 1 };
}

export function restPaginationMetadata(
  pagination: RestPagination,
  itemCount: number,
  total: number,
): RestPaginationMetadata {
  const nextOffset = pagination.offset + itemCount;
  return {
    page: pagination.page,
    limit: pagination.limit,
    total,
    nextCursor: nextOffset < total ? encodeCursor(nextOffset) : null,
  };
}
