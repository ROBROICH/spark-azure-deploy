import { defineResource } from "@spark-workflow/resource";

import type { PostgreSQLService } from "./runtime";

export const PostgreSQL = defineResource<PostgreSQLService>()("platform/PostgreSQL");
