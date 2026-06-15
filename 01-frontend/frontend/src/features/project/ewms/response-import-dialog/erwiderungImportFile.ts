const IMPORT_FILE_EXTENSIONS = ['.csv'] as const;

export const IMPORT_FILE_ACCEPT = IMPORT_FILE_EXTENSIONS.join(',');

export const isErwiderungImportFile = (file: File) =>
  IMPORT_FILE_EXTENSIONS.some((extension) =>
    file.name.toLowerCase().endsWith(extension),
  );
