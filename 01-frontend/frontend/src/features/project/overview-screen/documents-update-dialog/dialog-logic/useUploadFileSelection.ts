import { useState } from 'react';
import type { UploadFile } from '../DocumentsUploadContext';

const VALID_EXTENSIONS = ['.zip'] as const;

const isValidExtension = (filename: string) =>
  VALID_EXTENSIONS.some((ext) => filename.toLowerCase().endsWith(ext));

const validateNewFile = (file: File): UploadFile => {
  const isValid = isValidExtension(file.name);
  return {
    id: crypto.randomUUID(),
    file,
    status: isValid ? 'queued' : 'error',
    errorReason: isValid ? undefined : 'unsupported-format',
  };
};

/**
 * Owns the per-file selection list for the upload step plus per-file status mutations.
 *
 * @returns The current file list and handlers to add, remove, mark-failed, or reset the selection.
 */
export const useUploadFileSelection = () => {
  // eslint-disable-next-line no-restricted-syntax -- pre-submit form state local to the upload workflow.
  const [files, setFiles] = useState<UploadFile[]>([]);

  const addFiles = (incoming: File[]) => {
    setFiles((prev) => {
      const existingNames = new Set(prev.map((entry) => entry.file.name));
      const deduplicated = incoming.filter(
        (file) => !existingNames.has(file.name),
      );
      return [...prev, ...deduplicated.map(validateNewFile)];
    });
  };

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((entry) => entry.id !== id));
  };

  const markFileAsUploadFailed = (id: string) => {
    setFiles((prev) =>
      prev.map((entry) =>
        entry.id === id
          ? { ...entry, status: 'error', errorReason: 'upload-failed' }
          : entry,
      ),
    );
  };

  const resetFiles = () => setFiles([]);

  return { files, addFiles, removeFile, markFileAsUploadFailed, resetFiles };
};
