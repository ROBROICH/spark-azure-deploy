import type { FileType } from "./file-types.ts";

export interface ObjectPathContext {
  readonly type: FileType;
  readonly version: number;
  readonly projectId?: string;
  readonly workflowId?: string;
  readonly runId?: string;
  readonly revisionId?: string;
}

export function sanitizeFilename(name: string): string {
  const parts = name.replaceAll("\\", "/").split("/");
  const sanitized = parts.flatMap((part) => {
    if (part === "" || part === "." || part === "..") return [];
    const value = part
      .replace(/[<>:"/\\|?* \p{Cc}]/gu, "_")
      .replace(/\.+/g, ".")
      .replace(/^[ .]+|[ .]+$/g, "");
    return value === "" ? [] : [value];
  });
  if (sanitized.length === 0) throw new Error(`Filename cannot be empty: ${name}`);
  return sanitized.join("/");
}

const requireProject = (context: ObjectPathContext): string => {
  if (!context.projectId) throw new Error(`projectId is required for ${context.type}`);
  return context.projectId;
};

export function buildObjectPath(filename: string, context: ObjectPathContext): string {
  const safe = sanitizeFilename(filename);
  const version =
    context.revisionId === undefined
      ? `v${context.version}`
      : `revisions/${context.revisionId}/v${context.version}/${new Bun.CryptoHasher("sha256").update(filename).digest("hex")}`;
  switch (context.type) {
    case "document":
      return `documents/${requireProject(context)}/${version}/${safe}`;
    case "zip":
      return `zips/${requireProject(context)}/${version}/${safe}`;
    case "template":
      return context.projectId
        ? `templates/${context.projectId}/${version}/${safe}`
        : `templates/${version}/${safe}`;
    case "content_extraction":
      return `content_extraction/${requireProject(context)}/${version}/${safe}`;
    case "ewms_zip":
      return `ewms/${requireProject(context)}/${version}/${safe}`;
    case "ewms_document":
      return `ewms/${requireProject(context)}/files/${version}/${safe}`;
    case "erwiderungs_import":
      return `erwiderungs/imports/${requireProject(context)}/${version}/${safe}`;
    case "erwiderungs_export":
      return `erwiderungs/exports/${requireProject(context)}/${version}/${safe}`;
    case "law_data":
      return `law_data/${version}/${safe}`;
    case "redacted_document":
      return `redacted_documents/${requireProject(context)}/${version}/${safe}`;
    case "temporal_checkpoint": {
      if (!context.workflowId || !context.runId) {
        throw new Error("workflowId and runId are required for temporal_checkpoint");
      }
      const project = context.projectId ? `/${context.projectId}` : "";
      return `temporal_checkpoints/${context.workflowId}/${context.runId}${project}/${version}/${safe}`;
    }
  }
}
