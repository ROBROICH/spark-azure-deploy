# Drizzle-to-TypeBox API contracts

Use this only when the app uses Drizzle and TypeBox/Elysia route contracts.

Use the TypeBox helpers from `drizzle-typebox`.

## Current imports

```ts
import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-typebox";
import { t } from "elysia";
```

When a generated schema is passed to an Elysia route contract, use Elysia's `t.*` for overrides, refinements, and response composition in that route file.

## Table-derived schemas

Let Drizzle define the persistence shape. Derive TypeBox schemas from the table when the API contract follows the table.

```ts
const users = pgTable("users", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role", { enum: ["admin", "user"] }).notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Schema for inserting a user - can be used to validate API requests
const insertUserSchema = createInsertSchema(users);

// Schema for updating a user - can be used to validate API requests
const updateUserSchema = createUpdateSchema(users);

// Schema for selecting a user - can be used to validate API responses
const selectUserSchema = createSelectSchema(users);
```

Use generated schemas directly in route contracts when they are the endpoint contract.

```ts
app.get("/users", ({ db }) => db.query.user.findMany(), {
  response: t.Array(selectUserSchema),
  detail: { operationId: "listUsers" },
});
```

## Overrides

Override fields when the public API contract is intentionally different from the table-derived schema.

```ts
const insertUserSchema = createInsertSchema(users, {
  role: t.String(),
});
```

## Refinements

Use callback refinements when you need to change a field before Drizzle makes it nullable or optional in the final schema.

```ts
const insertUserSchema = createInsertSchema(users, {
  id: (schema) => t.Number({ ...schema, minimum: 0 }),
  role: t.String(),
});
```

## Validation

Use TypeBox `Value` helpers when code needs direct runtime validation outside Elysia's route contract handling.

```ts
import { Value } from "@sinclair/typebox/value";

const isUserValid: boolean = Value.Check(insertUserSchema, {
  name: "John Doe",
  email: "johndoe@test.com",
  role: "admin",
});
```

## Raw variants

Use a raw variant when data must be read before it can be trusted.

```ts
export const DBJobRaw = createSelectSchema(job, {
  metadata: t.Unknown(),
});

export const DBJob = createSelectSchema(job, {
  metadata: JobMetadata,
});
```

DO NOT turn this into a standalone validator-library doctrine. This is only about keeping DB-backed API contracts close to DB tables.

## Enriched responses

Compose enriched response schemas from generated DB schema properties.

```ts
export const UserWithTeams = t.Object({
  ...selectUserSchema.properties,
  teams: t.Array(DBTeam),
});
```

Use this for joins, computed fields, and nested data that are still returned as one API response.

## Rules

- Use `t.*` in Elysia route contract schemas.
- For new DB-shaped route contracts, prefer `createSelectSchema` over hand-writing a duplicate table-shaped `t.Object(...)`.
- Do not replace an existing success schema with a generated, shared, or imported schema unless the user explicitly asks to change that endpoint contract.
- DO NOT use generated insert/update schemas blindly if public API input differs from DB insert/update shape.
- DO NOT expose sensitive columns just because they exist in the table-derived schema.
- Prefer separate exported schema constants for reused route contracts.
