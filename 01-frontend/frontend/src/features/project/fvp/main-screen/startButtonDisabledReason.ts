export type StartButtonDisabledReason =
  | 'missingDocuments'
  | 'systemLoad'
  | 'systemLoadError'
  | 'filesLoadError';

/**
 * Chooses why the FVP start button is disabled. A files/system-load read
 * failure wins over `missingDocuments` so an outage is never misreported as an
 * empty project (the failed read defaults to an empty file list, which would
 * otherwise look identical to a project with no documents).
 */
export const getStartButtonDisabledReason = (params: {
  hasProjectFiles: boolean;
  isProjectFilesError: boolean;
  isProjectFilesLoading: boolean;
  isSystemLoadError: boolean;
  isSystemLoadHigh: boolean;
}): StartButtonDisabledReason | undefined => {
  if (params.isProjectFilesError) {
    return 'filesLoadError';
  }
  if (params.isSystemLoadError) {
    return 'systemLoadError';
  }
  if (params.isSystemLoadHigh) {
    return 'systemLoad';
  }
  if (!params.isProjectFilesLoading && !params.hasProjectFiles) {
    return 'missingDocuments';
  }
  return undefined;
};
