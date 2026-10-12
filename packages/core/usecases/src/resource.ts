import { persistenceError } from "@spark-workflow/postgres-runtime";
import { defineResource } from "@spark-workflow/resource";
import { Result } from "better-result";
import { sql } from "drizzle-orm";
import type { EvlogError } from "evlog";

import {
  projectLogicModels,
  type ProjectLogicDatabase,
  type ProjectLogicScope,
} from "../../projects/src/db.ts";
import { createUsecase, deleteUsecase, getUsecase, listCatalog, updateUsecase } from "./catalog.ts";

export interface UsecasesService {
  list(): ReturnType<typeof listCatalog>;
  getUsecase(usecaseId: string): ReturnType<typeof getUsecase>;
  create(input: Parameters<typeof createUsecase>[1]): ReturnType<typeof createUsecase>;
  update(
    usecaseId: string,
    input: Parameters<typeof updateUsecase>[2],
  ): ReturnType<typeof updateUsecase>;
  delete(usecaseId: string): ReturnType<typeof deleteUsecase>;
}

export const Usecases = defineResource<UsecasesService>()("core/Usecases");

export async function lockCatalogWrites(database: ProjectLogicDatabase) {
  await database.execute(sql`set transaction isolation level read committed`);
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtextextended('core/usecases/catalog', 0))`,
  );
}

const writeCatalog = <Value>(
  scope: ProjectLogicScope,
  write: (database: ProjectLogicDatabase) => Promise<Result<Value, EvlogError>>,
) =>
  Result.tryPromise({
    try: () =>
      scope.transact(() =>
        scope.query(async (database) => {
          await lockCatalogWrites(database);
          const result = await write(database);
          if (result.isErr()) throw result.error;
          return result.value;
        }),
      ),
    catch: persistenceError,
  });

export function createUsecasesService(scope: ProjectLogicScope): UsecasesService {
  return Object.freeze<UsecasesService>({
    list: () => scope.query((database) => listCatalog(projectLogicModels(database))),
    getUsecase: (usecaseId: string) =>
      scope.query((database) => getUsecase(projectLogicModels(database), usecaseId)),
    create: (input) =>
      writeCatalog(scope, (database) => createUsecase(projectLogicModels(database), input)),
    update: (usecaseId, input) =>
      writeCatalog(scope, (database) =>
        updateUsecase(projectLogicModels(database), usecaseId, input),
      ),
    delete: (usecaseId) =>
      writeCatalog(scope, (database) => deleteUsecase(projectLogicModels(database), usecaseId)),
  });
}
