import { defineErrorCatalog } from "evlog";

export const identityErrors = defineErrorCatalog("identity", {
  AUTHENTICATION_REQUIRED: {
    status: 401,
    message: "Authentication required",
    why: "The request has no validated current user",
    fix: "Send a valid bearer credential",
  },
  EMAIL_REQUIRED: {
    status: 401,
    message: "Email claim required",
    why: "The validated identity has no email claim",
    fix: "Add an email claim to the identity provider account",
  },
  ROLE_SWITCH_DISABLED: {
    status: 403,
    message: "Role switching is disabled",
    why: "Managed-role writes require a nonproduction environment and privileged Keycloak credentials",
    fix: "Use an explicitly configured nonproduction test environment",
  },
  ROLE_SWITCH_FORBIDDEN: {
    status: 403,
    message: "Role switching is not permitted for this account",
    why: "The account has no explicit Keycloak test-role-switcher assignment",
    fix: "Ask the nonproduction realm administrator to authorize the test account",
  },
  PROJECT_OWNER_REQUIRED: {
    status: 400,
    message: "At least one project owner is required.",
    why: "The requested assignment set has no owner",
    fix: "Add one owner assignment and retry",
  },
  ASSIGNMENT_REPLACEMENT_TOO_LARGE: {
    status: 413,
    message: "Project assignment replacement exceeds the atomic request budget.",
    why: "All removals and requested assignments must fit in one SpiceDB transaction",
    fix: "Reduce the number of changed assignments before retrying",
  },
  PROVIDER_UNAVAILABLE: {
    status: 500,
    message: "Identity provider unavailable",
    why: "Keycloak or SpiceDB did not complete the request",
    fix: "Retry after the identity provider is available",
  },
  DATABASE_UNAVAILABLE: {
    status: 500,
    message: "Identity migration database unavailable",
    why: "PostgreSQL could not read or update the SpiceDB migration ledger",
    fix: "Retry after PostgreSQL is available",
  },
});
