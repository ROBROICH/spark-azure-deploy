import { describe, expect, test } from "bun:test";

import {
  extractPostgresDriverErrorFacts,
  type PostgresDriverErrorFacts,
} from "../src/driver-error-facts";

interface CyclicDriverError {
  code?: string;
  message?: string;
  constraint?: string;
  cause?: CyclicDriverError | string;
}

function registerExtractorTests(): void {
  describe("PostgreSQL driver-error facts", () => {
  test("returns frozen descriptors, omits absent facts, and leaves inputs untouched", () => {
    const input = {
      code: "23505",
      message: "duplicate key",
      constraint: "project_name_key",
      privateValue: { id: "private-row-id" },
    };
    const original = structuredClone(input);

    const populated: PostgresDriverErrorFacts =
      extractPostgresDriverErrorFacts(input);
    const unsupportedInputs = [
      undefined,
      null,
      false,
      23_505,
      23_505n,
      "Database operation failed",
      Symbol("database-error"),
      () => "not an error object",
    ];

    expect(populated).toEqual({
      code: "23505",
      message: "duplicate key",
      constraint: "project_name_key",
    });
    expect(Object.keys(populated).sort()).toEqual([
      "code",
      "constraint",
      "message",
    ]);
    expect(Object.isFrozen(populated)).toBeTrue();
    for (const unsupported of unsupportedInputs) {
      const empty = extractPostgresDriverErrorFacts(unsupported);
      expect(empty).toEqual({});
      expect(Object.isFrozen(empty)).toBeTrue();
    }
    expect(input).toEqual(original);
  });

  test.each([
    ["sqlstate", "23505"],
    ["sqlState", "23P01"],
    ["code", "23503"],
    ["errno", "57P01"],
  ] as const)("accepts the %s code spelling", (property, value) => {
    expect(extractPostgresDriverErrorFacts({ [property]: value })).toEqual({
      code: value,
    });
  });

  test("uses exact within-node code precedence and preserves accepted values", () => {
    expect(
      extractPostgresDriverErrorFacts({
        sqlstate: " 23505 ",
        sqlState: "23P01",
        errno: "57P01",
        code: "23503",
      }),
    ).toEqual({ code: " 23505 " });
    expect(
      extractPostgresDriverErrorFacts({
        sqlState: "23P01",
        errno: "57P01",
        code: "23503",
      }),
    ).toEqual({ code: "23P01" });
    expect(
      extractPostgresDriverErrorFacts({
        errno: "23505",
        code: "ERR_POSTGRES_SERVER_ERROR",
      }),
    ).toEqual({ code: "23505" });

    for (const input of [
      { code: "last-raw-code" },
      {
        sqlstate: "",
        sqlState: " \t\n",
        errno: " ",
        code: "last-raw-code",
      },
      {
        sqlstate: true,
        sqlState: ["23505"],
        errno: Number.NaN,
        code: "last-raw-code",
      },
      new Proxy(
        { code: "last-raw-code" },
        {
          get(target, property, receiver) {
            if (
              property === "sqlstate" ||
              property === "sqlState" ||
              property === "errno"
            )
              throw new Error("hostile higher-priority code read");
            return Reflect.get(target, property, receiver);
          },
        },
      ),
    ])
      expect(extractPostgresDriverErrorFacts(input)).toEqual({
        code: "last-raw-code",
      });

    expect(extractPostgresDriverErrorFacts({ sqlstate: 23_505 })).toEqual({
      code: "23505",
    });
    expect(extractPostgresDriverErrorFacts({ code: -1 })).toEqual({
      code: "-1",
    });
  });

  test.each([
    { value: undefined },
    { value: null },
    { value: "" },
    { value: "  \t\n" },
    { value: Number.NaN },
    { value: Number.POSITIVE_INFINITY },
    { value: Number.NEGATIVE_INFINITY },
    { value: Number.MAX_SAFE_INTEGER + 1 },
    { value: 23.505 },
    { value: 23_505n },
    { value: true },
    { value: Symbol("code") },
    { value: ["23505"] },
  ])("rejects an unsupported code value without coercion: $value", ({
    value,
  }) => {
    expect(extractPostgresDriverErrorFacts({ code: value })).toEqual({});
  });

  test("does not invoke arbitrary code coercion", () => {
    let coercions = 0;
    const value = {
      toString() {
        coercions += 1;
        throw new Error("must not run");
      },
      valueOf() {
        coercions += 1;
        return 23_505;
      },
    };

    expect(extractPostgresDriverErrorFacts({ code: value })).toEqual({});
    expect(coercions).toBe(0);
  });

  test("selects every fact independently from the innermost node outward", () => {
    const error = {
      code: "outer-code",
      message: "outer message",
      constraint: "outer_constraint",
      cause: {
        message: "inner message",
        cause: {
          sqlState: "23505",
          constraint: "inner_constraint",
        },
      },
    };

    expect(extractPostgresDriverErrorFacts(error)).toEqual({
      code: "23505",
      message: "inner message",
      constraint: "inner_constraint",
    });
  });

  test("treats blank inner strings as absent and preserves raw outer strings exactly", () => {
    const message = "  duplicate key: private detail  ";
    const constraint = "  project_name_key  ";

    expect(
      extractPostgresDriverErrorFacts({
        message,
        constraint,
        cause: { message: " \n\t", constraint: "   " },
      }),
    ).toEqual({ message, constraint });
  });

  test("omits non-string message and constraint values", () => {
    expect(
      extractPostgresDriverErrorFacts({
        message: 500,
        constraint: { name: "project_name_key" },
      }),
    ).toEqual({});
  });

  test("inspects only the root plus four distinct object-valued causes", () => {
    let sixthCauseRead = false;
    const sixth = { code: "sixth-code", message: "sixth message" };
    const fifth = {
      code: "fifth-code",
      message: "fifth message",
      get cause() {
        sixthCauseRead = true;
        return sixth;
      },
    };
    const fourth = { cause: fifth };
    const third = { cause: fourth };
    const second = { cause: third };
    const root = { cause: second };

    expect(extractPostgresDriverErrorFacts(root)).toEqual({
      code: "fifth-code",
      message: "fifth message",
    });
    expect(sixthCauseRead).toBeFalse();
  });

  test("stops on primitive causes and identity revisits", () => {
    const selfCycle: CyclicDriverError = { code: "self" };
    selfCycle.cause = selfCycle;

    const first: CyclicDriverError = {
      message: "first message",
    };
    const second: CyclicDriverError = {
      constraint: "second_constraint",
    };
    first.cause = second;
    second.cause = first;

    expect(extractPostgresDriverErrorFacts(selfCycle)).toEqual({
      code: "self",
    });
    expect(extractPostgresDriverErrorFacts(first)).toEqual({
      message: "first message",
      constraint: "second_constraint",
    });
    expect(
      extractPostgresDriverErrorFacts({ code: "root", cause: "primitive" }),
    ).toEqual({ code: "root" });
  });

  test.each([
    ["sqlstate", { sqlState: "sql-state-fallback" }],
    ["sqlState", { code: "code-fallback" }],
    ["code", { errno: "errno-fallback" }],
    ["errno", { message: "safe message" }],
    ["message", { code: "safe-code" }],
    ["constraint", { message: "safe message" }],
  ] as const)(
    "contains a hostile %s read while retaining independent safe facts",
    (hostileProperty, safeFacts) => {
      const error = new Proxy(safeFacts, {
        get(target, property, receiver) {
          if (property === hostileProperty) throw new Error("hostile read");
          return Reflect.get(target, property, receiver);
        },
      });

      expect(() => extractPostgresDriverErrorFacts(error)).not.toThrow();
      const facts = extractPostgresDriverErrorFacts(error);
      expect(Object.isFrozen(facts)).toBeTrue();
      if ("sqlState" in safeFacts)
        expect(facts).toEqual({ code: safeFacts.sqlState });
      if ("code" in safeFacts)
        expect(facts).toEqual({ code: safeFacts.code });
      if ("errno" in safeFacts)
        expect(facts).toEqual({ code: safeFacts.errno });
      if ("message" in safeFacts)
        expect(facts).toEqual({ message: safeFacts.message });
    },
  );

  test("an unreadable cause stops descent after retaining current-node facts", () => {
    const error = new Proxy(
      {
        sqlstate: "23505",
        message: "root message",
        constraint: "root_constraint",
      },
      {
        get(target, property, receiver) {
          if (property === "cause") throw new Error("hostile cause");
          return Reflect.get(target, property, receiver);
        },
      },
    );

    expect(extractPostgresDriverErrorFacts(error)).toEqual({
      code: "23505",
      message: "root message",
      constraint: "root_constraint",
    });
  });

  test("falls back outward when an inner fact read is hostile", () => {
    const inner = new Proxy(
      { sqlstate: "23505" },
      {
        get(target, property, receiver) {
          if (property === "message") throw new Error("hostile inner message");
          return Reflect.get(target, property, receiver);
        },
      },
    );

    expect(
      extractPostgresDriverErrorFacts({
        message: "outer fallback",
        cause: inner,
      }),
    ).toEqual({ code: "23505", message: "outer fallback" });
  });

  test("contains throwing accessors without losing readable sibling facts", () => {
    const error = {
      code: "23505",
      constraint: "readable_constraint",
    };
    Object.defineProperties(error, {
      cause: {
        get() {
          throw new Error("hostile cause accessor");
        },
      },
      message: {
        get() {
          throw new Error("hostile message accessor");
        },
      },
      sqlstate: {
        get() {
          throw new Error("hostile code accessor");
        },
      },
    });

    expect(extractPostgresDriverErrorFacts(error)).toEqual({
      code: "23505",
      constraint: "readable_constraint",
    });
  });

  test("never throws for a proxy that rejects every reflective read", () => {
    const { proxy, revoke } = Proxy.revocable({}, {});
    revoke();

    expect(() => extractPostgresDriverErrorFacts(proxy)).not.toThrow();
    expect(extractPostgresDriverErrorFacts(proxy)).toEqual({});
  });

  test("never attempts to write through the input graph", () => {
    let writes = 0;
    const inner = new Proxy(
      { code: "23505", message: "inner" },
      {
        set() {
          writes += 1;
          return false;
        },
        defineProperty() {
          writes += 1;
          return false;
        },
        deleteProperty() {
          writes += 1;
          return false;
        },
      },
    );
    const root = new Proxy(
      { cause: inner, constraint: "outer_constraint" },
      {
        set() {
          writes += 1;
          return false;
        },
        defineProperty() {
          writes += 1;
          return false;
        },
        deleteProperty() {
          writes += 1;
          return false;
        },
      },
    );

    expect(extractPostgresDriverErrorFacts(root)).toEqual({
      code: "23505",
      message: "inner",
      constraint: "outer_constraint",
    });
    expect(writes).toBe(0);
  });
  });
}

registerExtractorTests();
