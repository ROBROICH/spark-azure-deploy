import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { Result } from "better-result";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { EvlogError } from "evlog";

import { usecaseErrors } from "./errors.ts";
import {
  BeschlussDocument,
  DokumenteDocument,
  GesetzesgrundlageDocument,
  ProjekttypDocument,
  type Usecase,
} from "./formats.ts";
import { REQUIRED_FILES, validateCatalog } from "./validate.ts";

const catalogLayoutHint =
  "expected <directory>/<authority>/{projekttyp,gesetzesgrundlage,dokumente,beschluss}.yaml";

const invalid = (message: string, cause?: Error) =>
  Result.err(usecaseErrors.INVALID_CATALOG({ message, cause }));

const asCatalogError = (message: string, cause: unknown) =>
  EvlogError.isEvlogError(cause)
    ? cause
    : usecaseErrors.INVALID_CATALOG({
        cause: cause instanceof Error ? cause : undefined,
        message,
      });

const asNotFound = (cause: unknown) =>
  EvlogError.isEvlogError(cause)
    ? cause
    : usecaseErrors.NOT_FOUND({
        cause: cause instanceof Error ? cause : undefined,
        message: `usecase catalog not found (${catalogLayoutHint})`,
      });

const parseYaml = <Schema extends TSchema>(schema: Schema, text: string, label: string) =>
  Result.gen(function* () {
    const value = yield* Result.try<unknown, EvlogError>({
      try: () => Bun.YAML.parse(text),
      catch: (error) =>
        usecaseErrors.INVALID_CATALOG({
          message: `invalid YAML in ${label}: ${error instanceof Error ? error.message : String(error)}`,
          cause: error instanceof Error ? error : undefined,
        }),
    });
    const parsed = yield* Result.try<Static<Schema>, EvlogError>({
      try: () => Value.Parse(schema, value),
      catch: (error) =>
        usecaseErrors.INVALID_CATALOG({
          message: `invalid document in ${label}: ${error instanceof Error ? error.message : String(error)}`,
          cause: error instanceof Error ? error : undefined,
        }),
    });
    return Result.ok(parsed);
  });

const loadAuthority = (directory: string, slug: string) =>
  Result.gen(async function* () {
    const names = yield* Result.await(
      Result.tryPromise({
        try: () => readdir(directory),
        catch: (cause) => asCatalogError(`could not read authority '${slug}'`, cause),
      }),
    );
    const files = new Set(names);
    for (const name of REQUIRED_FILES) {
      if (!files.has(name)) return invalid(`authority '${slug}' is missing ${name}`);
    }
    const read = (name: string) =>
      Result.tryPromise({
        try: () => Bun.file(join(directory, name)).text(),
        catch: (cause) => asCatalogError(`could not read ${slug}/${name}`, cause),
      });
    const projekttyp = yield* parseYaml(
      ProjekttypDocument,
      yield* Result.await(read("projekttyp.yaml")),
      `${slug}/projekttyp.yaml`,
    );
    const gesetzesgrundlage = yield* parseYaml(
      GesetzesgrundlageDocument,
      yield* Result.await(read("gesetzesgrundlage.yaml")),
      `${slug}/gesetzesgrundlage.yaml`,
    );
    const dokumente = yield* parseYaml(
      DokumenteDocument,
      yield* Result.await(read("dokumente.yaml")),
      `${slug}/dokumente.yaml`,
    );
    const beschluss = yield* parseYaml(
      BeschlussDocument,
      yield* Result.await(read("beschluss.yaml")),
      `${slug}/beschluss.yaml`,
    );
    return Result.ok({
      slug,
      projekttyp,
      gesetzesgrundlage,
      dokumente,
      beschluss,
    });
  });

const catalogCandidates = (): string[] => {
  const source = fileURLToPath(new URL("../usecases", import.meta.url));
  const packed = fileURLToPath(new URL("./usecases", import.meta.url));
  return source === packed ? [source] : [source, packed];
};

export const defaultUsecaseDirectory = (): string => {
  for (const candidate of catalogCandidates()) {
    if (existsSync(candidate)) return candidate;
  }
  return catalogCandidates()[0]!;
};

type AuthorityListing = {
  readonly exists: boolean;
  readonly slugs: readonly string[];
};

const authorityListing = async (directory: string): Promise<AuthorityListing> => {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return {
      exists: true,
      slugs: entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(),
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { exists: false, slugs: [] };
    }
    throw error;
  }
};

export const usecaseDirectoryExists = (directory: string) =>
  Result.gen(async function* () {
    const listing = yield* Result.await(
      Result.tryPromise({
        try: () => authorityListing(directory),
        catch: (cause) => asCatalogError(`could not read '${directory}'`, cause),
      }),
    );
    return Result.ok(listing.slugs.length > 0);
  });

export const loadUsecases = (options: { directory: string }) =>
  Result.gen(async function* () {
    const listing = yield* Result.await(
      Result.tryPromise({
        try: () => authorityListing(options.directory),
        catch: (cause) =>
          asCatalogError(`could not load usecase catalog from '${options.directory}'`, cause),
      }),
    );
    if (!listing.exists || listing.slugs.length === 0) {
      return Result.err(
        usecaseErrors.INVALID_CATALOG({
          message: `no authorities in '${options.directory}'`,
        }),
      );
    }
    const usecases: Usecase[] = [];
    for (const slug of listing.slugs) {
      usecases.push(yield* Result.await(loadAuthority(join(options.directory, slug), slug)));
    }
    yield* validateCatalog(usecases);
    return Result.ok({ usecases });
  });

export const resolveUsecaseDirectory = (mount = "/seed/catalog") =>
  Result.gen(async function* () {
    const mounted = yield* Result.await(
      Result.tryPromise({
        try: () => authorityListing(mount),
        catch: asNotFound,
      }),
    );
    if (!mounted.exists) {
      const fallback = defaultUsecaseDirectory();
      const shipped = yield* Result.await(
        Result.tryPromise({
          try: () => authorityListing(fallback),
          catch: asNotFound,
        }),
      );
      if (shipped.slugs.length === 0) {
        return Result.err(
          usecaseErrors.NOT_FOUND({
            message: `usecase catalog not found (${catalogLayoutHint})`,
          }),
        );
      }
      return Result.ok(fallback);
    }
    if (mounted.slugs.length === 0) {
      return Result.err(
        usecaseErrors.INVALID_CATALOG({
          message: `'${mount}' ${catalogLayoutHint}`,
        }),
      );
    }
    return Result.ok(mount);
  });
