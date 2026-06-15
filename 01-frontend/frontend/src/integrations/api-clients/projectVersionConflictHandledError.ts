const PROJECT_VERSION_CONFLICT_HANDLED_ERROR =
  'ProjectVersionConflictHandledError';

export function createHandledProjectVersionConflictError(): Error {
  const handledError = new Error('Project version conflict');
  handledError.name = PROJECT_VERSION_CONFLICT_HANDLED_ERROR;
  return handledError;
}

export function isHandledProjectVersionConflictError(
  error: unknown,
): error is Error {
  return (
    error instanceof Error &&
    error.name === PROJECT_VERSION_CONFLICT_HANDLED_ERROR
  );
}
