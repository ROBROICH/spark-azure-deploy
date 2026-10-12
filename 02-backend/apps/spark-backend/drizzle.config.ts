import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  out: "./src/migrations",
  schema: [
    "../../features/*/src/db/schema.ts",
    "../../../packages/audit-client/typescript/src/schema.ts",
    "../../../packages/core/documents/src/db/schema.ts",
    "../../../packages/core/projects/src/db/schema.ts",
  ],
});
