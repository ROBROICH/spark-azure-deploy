import { describe, expect, test } from "bun:test";
import {
  providePostgresTable,
  type PostgresTableResource,
} from "@spark-workflow/postgres-runtime/table-resource";
import { defineResource } from "@spark-workflow/resource";
import { integer, pgTable, primaryKey, varchar } from "drizzle-orm/pg-core";

const widgets = pgTable("resource_widget", {
  id: varchar("id").primaryKey(),
  name: varchar("name").notNull(),
  rank: integer("rank").notNull(),
});
const links = pgTable(
  "resource_link",
  {
    source: varchar("source").notNull(),
    target: varchar("target").notNull(),
  },
  (table) => [primaryKey({ columns: [table.source, table.target] })],
);
const schema = { links, widgets };

type WidgetService = PostgresTableResource<typeof widgets, "id", "id" | "name" | "rank">;
type BadWidgetService = PostgresTableResource<typeof widgets, "name", "name">;
type LinkService = PostgresTableResource<typeof links, "source" | "target", "source" | "target">;

const Widgets = defineResource<WidgetService>()("test/Widgets");
const BadWidgets = defineResource<BadWidgetService>()("test/BadWidgets");
const Links = defineResource<LinkService>()("test/Links");

describe("PostgreSQL table Resource provider", () => {
  test("accepts inline and composite primary keys", () => {
    expect(
      providePostgresTable({
        resource: Widgets,
        table: widgets,
        identity: ["id"] as const,
        filterFields: ["id", "name", "rank"] as const,
        schema,
      }).resource,
    ).toBe(Widgets);
    expect(
      providePostgresTable({
        resource: Links,
        table: links,
        identity: ["source", "target"] as const,
        filterFields: ["source", "target"] as const,
        schema,
      }).resource,
    ).toBe(Links);
  });

  test("rejects identities that are not the exact primary key", () => {
    expect(() =>
      providePostgresTable({
        resource: BadWidgets,
        table: widgets,
        identity: ["name"] as const,
        filterFields: ["name"] as const,
        schema,
      }),
    ).toThrow("must exactly match a primary or unique key");
    expect(() =>
      providePostgresTable({
        resource: Links,
        table: links,
        identity: ["target", "source"] as const,
        filterFields: ["source", "target"] as const,
        schema,
      }),
    ).toThrow("must exactly match a primary or unique key");
  });

  test("rejects a table outside the scoped schema", () => {
    expect(() =>
      providePostgresTable({
        resource: Widgets,
        table: widgets,
        identity: ["id"] as const,
        filterFields: ["id"] as const,
        schema: { links },
      }),
    ).toThrow("must belong to its PostgreSQL schema");
  });

  test("keeps table and filter fields type checked", () => {
    const invalidFilter = () =>
      providePostgresTable({
        resource: Widgets,
        table: widgets,
        identity: ["id"] as const,
        // @ts-expect-error the table has no missing filter field
        filterFields: ["missing"] as const,
        schema,
      });
    expect(invalidFilter).toBeFunction();
  });
});
