import type { AuthPolicy } from "@spark-workflow/authentification";

export const serviceOnlyPolicy = { roles: ["service"] } satisfies AuthPolicy;

export const templateManagementPolicy = {
  roles: ["admin", "service"],
} satisfies AuthPolicy;

export const createProjectPolicy = {
  permissions: [{ resource: "project", permission: "create", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;

export const updateProjectPolicy = {
  permissions: [{ resource: "project", permission: "update", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;

export const deleteProjectPolicy = {
  permissions: [{ resource: "project", permission: "delete", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;
