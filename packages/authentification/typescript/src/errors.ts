import { defineErrorCatalog } from "evlog";

export const authenticationErrors = defineErrorCatalog("authentication", {
  INVALID_CONFIGURATION: {
    status: 500,
    message: "Authentication configuration is invalid",
  },
  INVALID_CREDENTIAL: {
    status: 401,
    message: "Invalid authentication credential",
  },
  MISSING_CREDENTIAL: {
    status: 401,
    message: "Missing or invalid Authorization header",
  },
  MACHINE_IDENTITY_NOT_ALLOWED: {
    status: 401,
    message: "Machine identity not allowed",
  },
  ACCESS_DENIED: {
    status: 403,
    message: "Access denied",
  },
  INVALID_RESOURCE_ID: {
    status: 400,
    message: "Could not parse resource ID from request",
  },
  PROVIDER_UNAVAILABLE: {
    status: 503,
    message: "Authorization provider unavailable",
  },
  SPICEDB_NOT_CONFIGURED: {
    status: 503,
    message: "SpiceDB is not configured",
  },
});
