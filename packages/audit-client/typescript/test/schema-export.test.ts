import { expect, test } from "bun:test";
import { auditLogs } from "@spark-workflow/audit-client/schema";
import { getTableName } from "drizzle-orm";

test("the schema-only public subpath exposes the canonical audit table", () => {
  expect(getTableName(auditLogs)).toBe("audit_log");
});
