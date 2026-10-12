import { defineError } from "evlog";

export const UnknownNodeTypeError = defineError("node-crud.INVALID_REQUEST", {
  status: 422,
  message: "Invalid node request",
});

export const NodeNotFoundError = defineError("node-crud.NOT_FOUND", {
  status: 404,
  message: "Node not found",
});

export const MutationBatchNotFoundError = defineError("node-crud.NOT_FOUND", {
  status: 404,
  message: "Node not found",
});

export const InvalidNodeRequestError = defineError("node-crud.INVALID_REQUEST", {
  status: 422,
  message: "Invalid node request",
});

export const MutationTargetConflictError = defineError("node-crud.MUTATION_CONFLICT", {
  status: 400,
  message: "Node mutation conflict",
});

export const InvalidParentError = defineError("node-crud.INVALID_REQUEST", {
  status: 422,
  message: "Invalid node request",
});

export const NodePermissionError = defineError("node-crud.FORBIDDEN", {
  status: 403,
  message: "Permission denied",
});

export const NodeVersionError = defineError("node-crud.CONFLICT", {
  status: 409,
  message: "Project version conflict",
});
