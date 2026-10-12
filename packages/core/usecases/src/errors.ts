import { defineErrorCatalog, type EvlogError } from "evlog";

export const usecaseErrors = defineErrorCatalog("core-usecases", {
  INVALID_CATALOG: {
    status: 422,
    message: "Usecase catalog is invalid",
    why: "The four documents fail validation or are incomplete",
    fix: "Repair the usecase so it is complete and internally consistent",
  },
  AUTHORITY_NOT_FOUND: {
    status: 404,
    message: "Usecase authority not found",
    why: "No usecase_document rows exist for this authority id",
    fix: "Create the authority or use an id that is already in the catalog",
  },
  CONFLICT: {
    status: 409,
    message: "Usecase authority already exists",
    why: "The catalog already has an authority with this projekttyp.id",
    fix: "Use a new id or update the existing authority",
  },
  STALE_CATALOG: {
    status: 409,
    message: "Usecase catalog changed",
    why: "The catalog was updated after the caller read it",
    fix: "Reload the catalog and apply the change to the current version",
  },
  UNAUTHORIZED: {
    status: 401,
    message: "Usecase catalog request is not authenticated",
    why: "Project Logic rejected the catalog request without a principal",
    fix: "Send an authenticated request",
  },
  FORBIDDEN: {
    status: 403,
    message: "Usecase catalog request is not allowed",
    why: "The principal cannot read or write the usecase catalog",
    fix: "Use an admin or service principal for writes, or an authenticated principal for reads",
  },
  UNAVAILABLE: {
    status: 503,
    message: "Usecase catalog is unavailable",
    why: "Reading or writing usecase_document failed",
    fix: "Retry after the database is reachable",
  },
  NOT_FOUND: {
    status: 500,
    message: "Usecase catalog not found",
    why: "No authority directory exists at the mount or the shipped fallback",
    fix: "Mount /seed/catalog/<authority>/… or ship the package usecases tree",
  },
});

export const errorFromCatalogHttp = (status: number, detail: string): EvlogError | undefined => {
  switch (status) {
    case 401:
      return usecaseErrors.UNAUTHORIZED({ message: detail });
    case 403:
      return usecaseErrors.FORBIDDEN({ message: detail });
    case 404:
      return usecaseErrors.AUTHORITY_NOT_FOUND({ message: detail });
    case 409:
      return usecaseErrors.CONFLICT({ message: detail });
    case 422:
      return usecaseErrors.INVALID_CATALOG({ message: detail });
    case 503:
      return usecaseErrors.UNAVAILABLE({ message: detail });
    default:
      return undefined;
  }
};
