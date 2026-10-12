import { isoInstant } from "@spark-workflow/http-host";
import { persistenceError } from "@spark-workflow/postgres-runtime";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import type { BetterDrizzleClient } from "better-drizzle";
import { Result } from "better-result";
import type { EvlogError } from "evlog";

import { usecaseErrors } from "./errors.ts";
import {
  BeschlussDocument,
  DokumenteDocument,
  GesetzesgrundlageDocument,
  ProjekttypDocument,
  UsecaseDocumentTypes,
  type UsecaseDocumentType,
  type Usecase,
  type UsecaseCatalogResponse,
  type UsecaseResponse,
  type UsecaseUpdate,
  type UsecaseWrite,
} from "./formats.ts";
import { toUsecaseDocumentRows, type UsecaseDatabaseSchema } from "./schema.ts";
import { validateCatalog } from "./validate.ts";

export type UsecaseDocumentRecord = {
  readonly authorityId: string;
  readonly type: string;
  readonly document: unknown;
  readonly updatedAt?: Date;
};

const invalid = (message: string) => Result.err(usecaseErrors.INVALID_CATALOG({ message }));

const usecaseFromWrite = (input: UsecaseWrite, slug: string): Usecase => ({
  slug,
  projekttyp: input.projekttyp,
  gesetzesgrundlage: input.gesetzesgrundlage,
  dokumente: input.dokumente,
  beschluss: input.beschluss,
});

const readDocument = <Schema extends TSchema>(
  rows: readonly UsecaseDocumentRecord[],
  type: UsecaseDocumentType,
  schema: Schema,
  authorityId: string,
) => {
  const matches = rows.filter((row) => row.type === type);
  if (matches.length === 0) return invalid(`authority '${authorityId}' is missing ${type}`);
  if (matches.length > 1) return invalid(`duplicate ${type} for '${authorityId}'`);
  return Result.try<Static<Schema>, EvlogError>({
    try: () => Value.Parse(schema, matches[0]!.document),
    catch: (error) =>
      usecaseErrors.INVALID_CATALOG({
        message: `invalid ${type} in '${authorityId}'`,
        cause: error instanceof Error ? error : undefined,
      }),
  });
};

export const catalogFromRows = (rows: readonly UsecaseDocumentRecord[]) =>
  Result.gen(function* () {
    const knownTypes: readonly string[] = UsecaseDocumentTypes;
    const byAuthority = new Map<string, UsecaseDocumentRecord[]>();
    for (const row of rows) {
      if (!knownTypes.includes(row.type)) {
        return invalid(`unknown usecase document type '${row.type}'`);
      }
      const current = byAuthority.get(row.authorityId) ?? [];
      current.push(row);
      byAuthority.set(row.authorityId, current);
    }

    const usecases: Usecase[] = [];
    for (const [authorityId, authorityRows] of byAuthority) {
      const usecase = usecaseFromWrite(
        {
          projekttyp: yield* readDocument(
            authorityRows,
            "projekttyp",
            ProjekttypDocument,
            authorityId,
          ),
          gesetzesgrundlage: yield* readDocument(
            authorityRows,
            "gesetzesgrundlage",
            GesetzesgrundlageDocument,
            authorityId,
          ),
          dokumente: yield* readDocument(
            authorityRows,
            "dokumente",
            DokumenteDocument,
            authorityId,
          ),
          beschluss: yield* readDocument(
            authorityRows,
            "beschluss",
            BeschlussDocument,
            authorityId,
          ),
        },
        authorityId,
      );
      if (usecase.projekttyp.id !== authorityId) {
        return invalid(
          `authority '${authorityId}' projekttyp.id '${usecase.projekttyp.id}' mismatch`,
        );
      }
      usecases.push(usecase);
    }
    usecases.sort((left, right) => left.projekttyp.id.localeCompare(right.projekttyp.id));
    yield* validateCatalog(usecases);
    return Result.ok({ usecases });
  });

const catalogResponseFromRows = (rows: readonly UsecaseDocumentRecord[]) =>
  Result.gen(function* () {
    const catalog = yield* catalogFromRows(rows);
    const usecases: UsecaseResponse[] = [];

    for (const usecase of catalog.usecases) {
      const timestamps = rows
        .filter((row) => row.authorityId === usecase.projekttyp.id)
        .map((row) => row.updatedAt?.getTime());
      const uniqueTimestamps = new Set(timestamps);
      const updatedAt = timestamps[0];
      if (
        timestamps.length !== UsecaseDocumentTypes.length ||
        updatedAt === undefined ||
        !Number.isFinite(updatedAt) ||
        uniqueTimestamps.size !== 1
      ) {
        return invalid(`authority '${usecase.projekttyp.id}' has no consistent update version`);
      }
      usecases.push({ ...usecase, updatedAt: isoInstant(new Date(updatedAt)) });
    }

    return Result.ok({ usecases } satisfies UsecaseCatalogResponse);
  });

export const listCatalog = (db: BetterDrizzleClient<UsecaseDatabaseSchema>) =>
  Result.gen(async function* () {
    const rows = yield* Result.await(
      Result.tryPromise({
        try: () =>
          db.usecaseDocuments.findMany({
            select: { authorityId: true, type: true, document: true, updatedAt: true },
          }),
        catch: persistenceError,
      }),
    );
    const catalog = yield* catalogResponseFromRows(rows);
    return Result.ok(catalog);
  });

const persistUsecase = (
  db: BetterDrizzleClient<UsecaseDatabaseSchema>,
  usecase: Usecase,
  expectedUpdatedAt?: string,
) =>
  Result.tryPromise({
    try: async () => {
      const expectedTimestamp =
        expectedUpdatedAt === undefined ? undefined : new Date(expectedUpdatedAt).getTime();
      const updatedAt = new Date(
        expectedTimestamp === undefined ? Date.now() : Math.max(Date.now(), expectedTimestamp + 1),
      );
      const rows = toUsecaseDocumentRows({ usecases: [usecase] }).map((row) => ({
        ...row,
        updatedAt,
      }));

      if (expectedTimestamp === undefined) {
        await db.usecaseDocuments.createMany({ data: rows });
      } else {
        const deleted = await db.usecaseDocuments.deleteMany({
          where: {
            authorityId: usecase.projekttyp.id,
            updatedAt: {
              gte: new Date(expectedTimestamp),
              lt: new Date(expectedTimestamp + 1),
            },
          },
        });
        if (deleted.count !== UsecaseDocumentTypes.length) {
          throw usecaseErrors.STALE_CATALOG({
            message: `authority '${usecase.projekttyp.id}' changed after it was read`,
          });
        }
        await db.usecaseDocuments.createMany({ data: rows });
      }

      return { ...usecase, updatedAt: isoInstant(updatedAt) } satisfies UsecaseResponse;
    },
    catch: persistenceError,
  });

export const getUsecase = (db: BetterDrizzleClient<UsecaseDatabaseSchema>, usecaseId: string) =>
  Result.gen(async function* () {
    const rows = yield* Result.await(
      Result.tryPromise({
        try: () =>
          db.usecaseDocuments.findMany({
            select: { authorityId: true, type: true, document: true, updatedAt: true },
            where: { authorityId: usecaseId },
          }),
        catch: persistenceError,
      }),
    );
    if (rows.length === 0) {
      return Result.err(
        usecaseErrors.AUTHORITY_NOT_FOUND({
          message: `authority '${usecaseId}' not found`,
        }),
      );
    }
    const catalog = yield* catalogResponseFromRows(rows);
    return Result.ok(catalog.usecases[0]!);
  });

export const createUsecase = (
  db: BetterDrizzleClient<UsecaseDatabaseSchema>,
  input: UsecaseWrite,
) =>
  Result.gen(async function* () {
    if (input.slug !== undefined && input.slug !== input.projekttyp.id) {
      return invalid("slug must match projekttyp.id");
    }
    const usecase = usecaseFromWrite(input, input.projekttyp.id);
    const catalog = yield* Result.await(listCatalog(db));
    if (catalog.usecases.some((candidate) => candidate.projekttyp.id === usecase.projekttyp.id)) {
      return Result.err(
        usecaseErrors.CONFLICT({
          message: `authority '${usecase.projekttyp.id}' already exists`,
        }),
      );
    }
    yield* validateCatalog([...catalog.usecases, usecase]);
    const persisted = yield* Result.await(persistUsecase(db, usecase));
    return Result.ok(persisted);
  });

export const updateUsecase = (
  db: BetterDrizzleClient<UsecaseDatabaseSchema>,
  usecaseId: string,
  input: UsecaseUpdate,
) =>
  Result.gen(async function* () {
    if (input.projekttyp.id !== usecaseId) {
      return invalid("projekttyp.id must match the authority");
    }
    if (input.slug !== undefined && input.slug !== usecaseId) {
      return invalid("slug must match projekttyp.id");
    }
    const catalog = yield* Result.await(listCatalog(db));
    if (!catalog.usecases.some((candidate) => candidate.projekttyp.id === usecaseId)) {
      return Result.err(
        usecaseErrors.AUTHORITY_NOT_FOUND({
          message: `authority '${usecaseId}' not found`,
        }),
      );
    }
    const usecase = usecaseFromWrite(input, usecaseId);
    yield* validateCatalog(
      catalog.usecases.map((candidate) =>
        candidate.projekttyp.id === usecaseId ? usecase : candidate,
      ),
    );
    const persisted = yield* Result.await(persistUsecase(db, usecase, input.updatedAt));
    return Result.ok(persisted);
  });

export const deleteUsecase = (db: BetterDrizzleClient<UsecaseDatabaseSchema>, usecaseId: string) =>
  Result.gen(async function* () {
    const usecase = yield* Result.await(getUsecase(db, usecaseId));
    const deleted = yield* Result.await(
      Result.tryPromise({
        try: () => db.usecaseDocuments.deleteMany({ where: { authorityId: usecaseId } }),
        catch: persistenceError,
      }),
    );
    if (deleted.count !== UsecaseDocumentTypes.length) {
      return Result.err(
        usecaseErrors.STALE_CATALOG({
          message: `authority '${usecaseId}' changed while it was deleted`,
        }),
      );
    }
    return Result.ok(usecase);
  });
