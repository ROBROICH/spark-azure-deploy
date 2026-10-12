import { persistenceError } from "@spark-workflow/postgres-runtime";
import type { BetterDrizzleClient } from "better-drizzle";
import { Result } from "better-result";

import { listCatalog } from "./catalog.ts";
import { loadUsecases, resolveUsecaseDirectory } from "./load.ts";
import { toUsecaseDocumentRows, type UsecaseDatabaseSchema } from "./schema.ts";

export const seedUsecaseCatalog = (db: BetterDrizzleClient<UsecaseDatabaseSchema>) =>
  Result.gen(async function* () {
    const existing = yield* Result.await(listCatalog(db));
    if (existing.usecases.length > 0) return Result.ok(existing);

    const directory = yield* Result.await(resolveUsecaseDirectory());
    const catalog = yield* Result.await(loadUsecases({ directory }));
    const rows = toUsecaseDocumentRows(catalog);
    const persisted = yield* Result.await(
      Result.tryPromise({
        try: async () => {
          if (rows.length > 0) {
            await db.usecaseDocuments.createMany({ data: rows });
          }
          return catalog;
        },
        catch: persistenceError,
      }),
    );
    return Result.ok(persisted);
  });
