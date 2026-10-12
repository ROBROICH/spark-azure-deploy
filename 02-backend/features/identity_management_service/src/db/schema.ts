import { pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const spiceDbMigrations = pgTable("spicedb_migrations", {
  version: varchar("version").primaryKey(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
});

export const identityDatabaseSchema = { spiceDbMigrations };
