import { describe, expect, test } from "bun:test";
import { EvlogError } from "evlog";

import { errorFromCatalogHttp } from "../src/index.ts";

describe("errorFromCatalogHttp", () => {
  test("maps catalog HTTP statuses onto usecase errors", () => {
    const notFound = errorFromCatalogHttp(404, "authority missing");
    expect(notFound?.status).toBe(404);
    expect(notFound?.message).toBe("authority missing");
    expect(EvlogError.isEvlogError(notFound)).toBe(true);

    const invalid = errorFromCatalogHttp(422, "duplicate order '0'");
    expect(invalid?.status).toBe(422);
    expect(invalid?.message).toBe("duplicate order '0'");

    expect(errorFromCatalogHttp(409, "already exists")?.status).toBe(409);
    expect(errorFromCatalogHttp(503, "database down")?.status).toBe(503);
    expect(errorFromCatalogHttp(403, "not allowed")?.status).toBe(403);
    expect(errorFromCatalogHttp(401, "no principal")?.status).toBe(401);
  });

  test("does not claim transport failures as catalog domain errors", () => {
    expect(errorFromCatalogHttp(502, "bad gateway")).toBeUndefined();
    expect(errorFromCatalogHttp(500, "boom")).toBeUndefined();
    expect(errorFromCatalogHttp(200, "ok")).toBeUndefined();
  });
});
