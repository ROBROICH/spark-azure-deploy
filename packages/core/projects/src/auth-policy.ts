import type { AuthPolicy } from "@spark-workflow/authentification";

export const authenticatedPolicy = {
  roles: ["service", "user", "admin"],
} satisfies AuthPolicy;

export const referenceReadPolicy = authenticatedPolicy;

export const referenceMutationPolicy = {
  roles: ["admin", "service"],
} satisfies AuthPolicy;

export const projectListPolicy = {} satisfies AuthPolicy;

export const projectCreatePolicy = {
  roles: ["admin", "user", "service"],
} satisfies AuthPolicy;

export const projectUpdatePolicy = {
  permissions: [{ resource: "project", permission: "update", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;

export const projectDeletePolicy = {
  roles: ["admin", "service"],
} satisfies AuthPolicy;

export const projectInitializePolicy = {
  permissions: [{ resource: "project", permission: "create", path: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;

export const createTopicPolicy = {
  permissions: [{ resource: "project", permission: "create", body: "projectId" }],
  bypassRoles: ["admin", "service"],
} satisfies AuthPolicy;

export const createDeadlinePolicy = createTopicPolicy;
