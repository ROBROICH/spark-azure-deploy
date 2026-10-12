export type Permission =
  | "create"
  | "update"
  | "delete"
  | "read"
  | "execute"
  | "assign"
  | "audit"
  | "export"
  | "approve";

export type Resource = "project" | "workflow" | "user" | "group";
export type Relation = "owner" | "member" | "auditor";
export type OidcRole = "admin" | "user" | "service";
