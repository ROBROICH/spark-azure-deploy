import { describe, expect, test } from "bun:test";
import { Type } from "@sinclair/typebox";

import {
  createHttpHost,
  InvalidRestQueryError,
  parseRestPagination,
  restPaginationMetadata,
} from "../src/index.ts";

const request = (query = "") => new Request(`http://localhost/items${query}`);

describe("ordinary REST pagination", () => {
  test("supports page and opaque cursor modes with stable defaults", () => {
    const first = parseRestPagination(request(), {});
    expect(first).toEqual({ limit: 50, offset: 0, page: 1 });
    const metadata = restPaginationMetadata(first, 50, 75);
    expect(metadata).toEqual({ limit: 50, nextCursor: "NTA", page: 1, total: 75 });
    expect(
      parseRestPagination(request(`?limit=50&cursor=${metadata.nextCursor}`), {
        limit: 50,
        cursor: metadata.nextCursor!,
      }),
    ).toEqual({ limit: 50, offset: 50, page: 2 });
    expect(parseRestPagination(request("?limit=25&page=3"), { limit: 25, page: 3 })).toEqual({
      limit: 25,
      offset: 50,
      page: 3,
    });
  });

  test("accepts declared filters and rejects ambiguous or unknown parameters", () => {
    expect(
      parseRestPagination(
        request("?status=open&status=closed"),
        {},
        ["status"],
      ),
    ).toEqual({ limit: 50, offset: 0, page: 1 });

    const invalid: readonly [string, Parameters<typeof parseRestPagination>[1]][] = [
      ["?unknown=x", {}],
      ["?limit=1&limit=2", { limit: 1 }],
      ["?page=1&cursor=MA", { page: 1, cursor: "MA" }],
      ["?cursor=not-a-cursor", { cursor: "not-a-cursor" }],
    ];
    for (const [query, parsed] of invalid) {
      expect(() => parseRestPagination(request(query), parsed)).toThrow(InvalidRestQueryError);
    }
  });

  test("maps invalid public queries to an HTTP 400 response", async () => {
    const app = createHttpHost("rest-test").get(
      "/items",
      ({ request }) => parseRestPagination(request, {}),
      { query: Type.Object({}, { additionalProperties: true }) },
    );
    const response = await app.handle(request("?unknown=x"));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ detail: "Unknown query parameter: unknown" });
  });
});
