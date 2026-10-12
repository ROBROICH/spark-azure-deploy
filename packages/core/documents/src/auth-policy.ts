import type { AuthPolicy } from "@spark-workflow/authentification";

export const authenticatedPolicy = {
  roles: ["admin", "user", "service"],
} satisfies AuthPolicy;

export const createProjectResourcePolicy = {
  ...authenticatedPolicy,
  permissions: [{ resource: "project", permission: "create", body: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;

export const serviceOnlyPolicy = { machine: true, roles: ["service"] } satisfies AuthPolicy;
