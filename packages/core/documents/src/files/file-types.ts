import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { DmsHttpError, DmsValidationError } from "../errors.ts";

export const FilenameSchema = Type.String({
  minLength: 1,
  maxLength: 1024,
  pattern: "^[^/\\\\]+(?:[/\\\\][^/\\\\]+){0,31}$",
});

export function validateFilename(filename: string): void {
  if (!Value.Check(FilenameSchema, filename)) {
    throw DmsValidationError({
      message: "Filename must contain at most 1024 characters and 32 path components",
    });
  }
}

export const fileTypes = [
  "document",
  "zip",
  "ewms_zip",
  "ewms_document",
  "erwiderungs_import",
  "erwiderungs_export",
  "template",
  "law_data",
  "content_extraction",
  "temporal_checkpoint",
  "redacted_document",
] as const;

export type FileType = (typeof fileTypes)[number];

export const publicUploadFileTypes = [
  "document",
  "zip",
  "template",
  "ewms_zip",
  "erwiderungs_import",
] satisfies readonly FileType[];

export const internalFileTypes = new Set<FileType>([
  "temporal_checkpoint",
  "content_extraction",
  "law_data",
  "redacted_document",
  "erwiderungs_export",
]);

export const zipFileTypes = ["zip", "ewms_zip"] satisfies readonly FileType[];

export const databaseFileType = (type: FileType): Uppercase<FileType> =>
  type.toUpperCase() as Uppercase<FileType>;

export const apiFileType = (type: string): FileType => type.toLowerCase() as FileType;

const publicExtensions = {
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".zip": "application/zip",
};

const internalExtensions = {
  ...publicExtensions,
  ".json": "application/json",
  ".md": "text/markdown",
};

const erwiderungsExtensions = { ".csv": "text/csv" };

const extensionOf = (filename: string): string => {
  const leaf = filename.replaceAll("\\", "/").split("/").at(-1) ?? "";
  const separator = leaf.lastIndexOf(".");
  return separator < 0 ? "" : leaf.slice(separator).toLowerCase();
};

export function mimeTypeForUpload(filename: string, type: FileType): string {
  validateFilename(filename);
  const extensions =
    type === "erwiderungs_import" || type === "erwiderungs_export"
      ? erwiderungsExtensions
      : internalFileTypes.has(type)
        ? internalExtensions
        : publicExtensions;
  const extension = extensionOf(filename);
  const mimeType = (extensions as Readonly<Record<string, string>>)[extension];
  if (mimeType !== undefined) return mimeType;
  throw DmsHttpError({
    status: 415,
    message: `File type '${extension}' is not supported. Allowed types: ${Object.keys(extensions)
      .sort()
      .join(", ")}`,
  });
}
