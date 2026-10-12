import { describe, expect, test } from "bun:test";
import { Elysia, t } from "elysia";
import { isPlainObject } from "es-toolkit";

import { createHttpHost } from "../src/index.ts";

const itemStatus = async (
  app: Pick<ReturnType<typeof createHttpHost>, "handle">,
  property: string,
) => {
  const response = await app.handle(new Request("http://localhost/openapi.json"));
  expect(response.ok).toBe(true);
  const spec = await response.json();
  if (
    !isPlainObject(spec) ||
    !isPlainObject(spec.components) ||
    !isPlainObject(spec.components.schemas) ||
    !isPlainObject(spec.components.schemas.Item) ||
    !isPlainObject(spec.components.schemas.Item.properties)
  ) {
    throw new Error("unexpected /openapi.json shape");
  }
  expect(spec.openapi).toBe("3.1.0");
  return spec.components.schemas.Item.properties[property];
};

describe("GET /openapi.json TypeBox nullability", () => {
  test("preserves a nullable reference", async () => {
    const models = new Elysia({ name: "http-host.openapi-nullable.models" }).model({
      Status: t.UnionEnum(["A", "B"]),
    });
    const service = models
      .model({
        Item: t.Object(
          { status: t.Nullable(models.Ref("Status")) },
          { additionalProperties: false },
        ),
      })
      .get("/item", () => ({ status: null }), {
        response: "Item",
        detail: { operationId: "getItem" },
      });

    const status = await itemStatus(createHttpHost("openapi-nullable").use(service), "status");
    expect(status).toEqual({
      anyOf: [{ $ref: "Status" }, { type: "null" }],
      nullable: true,
    });
  });

  test("preserves an inline nullable schema", async () => {
    const service = new Elysia()
      .model({
        Item: t.Object(
          { email: t.Nullable(t.String({ format: "email" })) },
          { additionalProperties: false },
        ),
      })
      .get("/item", () => ({ email: null }), {
        response: "Item",
        detail: { operationId: "getItem" },
      });

    expect(
      await itemStatus(createHttpHost("openapi-nullable-inline").use(service), "email"),
    ).toEqual({
      anyOf: [{ type: "string", format: "email" }, { type: "null" }],
      nullable: true,
    });
  });

  test("preserves null in an enum union", async () => {
    const service = new Elysia()
      .model({
        Item: t.Object(
          {
            update_type: t.Union([t.Literal("automated"), t.Literal("manual"), t.Null()]),
          },
          { additionalProperties: false },
        ),
      })
      .get("/item", () => ({ update_type: null }), {
        response: "Item",
        detail: { operationId: "getItem" },
      });

    const updateType = await itemStatus(
      createHttpHost("openapi-nullable-union").use(service),
      "update_type",
    );
    expect(updateType).toEqual({
      anyOf: [
        { const: "automated", type: "string" },
        { const: "manual", type: "string" },
        { type: "null" },
      ],
    });
  });

  test("preserves a non-null union", async () => {
    const service = new Elysia()
      .model({
        Item: t.Object(
          { value: t.Union([t.String(), t.Number()]) },
          { additionalProperties: false },
        ),
      })
      .get("/item", () => ({ value: "automated" }), {
        response: "Item",
        detail: { operationId: "getItem" },
      });

    const value = await itemStatus(createHttpHost("openapi-non-null-union").use(service), "value");
    expect(value).toEqual({ anyOf: [{ type: "string" }, { type: "number" }] });
  });
});
