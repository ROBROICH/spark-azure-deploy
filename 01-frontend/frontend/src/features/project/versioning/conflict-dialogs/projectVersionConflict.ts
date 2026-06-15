export type ProjectVersionConflictKind = 'not_latest' | 'version_locked';

export type ProjectVersionConflict = {
  kind: ProjectVersionConflictKind;
  projectId: string;
};

const PROJECT_VERSION_CONFLICT_EVENT = 'spark:project-version-conflict';

type ErrorBody = {
  code?: unknown;
  detail?: unknown;
  message?: unknown;
};

const knownNotLatestCodes = new Set([
  'VersionNotLatestError',
  'VERSION_NOT_LATEST',
  'PROJECT_VERSION_NOT_LATEST',
]);

const knownLockedCodes = new Set([
  'ProjectVersionLockedError',
  'PROJECT_VERSION_LOCKED',
]);

const getErrorBody = (error: unknown): ErrorBody | null => {
  if (typeof error !== 'object' || error === null) {
    return null;
  }

  return error as ErrorBody;
};

const getErrorMessage = (error: unknown): string => {
  if (typeof error === 'string') {
    return error;
  }

  const body = getErrorBody(error);
  if (!body) {
    return '';
  }

  if (typeof body.detail === 'string') {
    return body.detail;
  }

  if (
    typeof body.detail === 'object' &&
    body.detail !== null &&
    'message' in body.detail &&
    typeof body.detail.message === 'string'
  ) {
    return body.detail.message;
  }

  if (typeof body.message === 'string') {
    return body.message;
  }

  return '';
};

export function classifyProjectVersionConflict(
  error: unknown,
): ProjectVersionConflictKind | null {
  const body = getErrorBody(error);
  const nestedDetail = body?.detail;
  const code =
    typeof body?.code === 'string'
      ? body.code
      : typeof nestedDetail === 'object' &&
          nestedDetail !== null &&
          'code' in nestedDetail &&
          typeof nestedDetail.code === 'string'
        ? nestedDetail.code
        : '';

  if (knownNotLatestCodes.has(code)) {
    return 'not_latest';
  }

  if (knownLockedCodes.has(code)) {
    return 'version_locked';
  }

  const normalizedMessage = getErrorMessage(error).toLowerCase();

  if (
    normalizedMessage.includes('project version is not latest') ||
    normalizedMessage.includes('provided version is not latest') ||
    (normalizedMessage.includes('project version') &&
      normalizedMessage.includes('is not the latest version'))
  ) {
    return 'not_latest';
  }

  if (
    normalizedMessage.includes('project version is locked') ||
    (normalizedMessage.includes('project version') &&
      normalizedMessage.includes('active lock'))
  ) {
    return 'version_locked';
  }

  return null;
}

export function emitProjectVersionConflict(
  conflict: ProjectVersionConflict,
): void {
  window.dispatchEvent(
    new CustomEvent<ProjectVersionConflict>(PROJECT_VERSION_CONFLICT_EVENT, {
      detail: conflict,
    }),
  );
}

export function subscribeProjectVersionConflict(
  handler: (conflict: ProjectVersionConflict) => void,
): () => void {
  const listener = (event: Event) => {
    const conflict =
      (event as CustomEvent<Partial<ProjectVersionConflict> | undefined>)
        .detail ?? {};
    if (
      (conflict.kind !== 'not_latest' && conflict.kind !== 'version_locked') ||
      typeof conflict.projectId !== 'string'
    ) {
      return;
    }

    handler({ kind: conflict.kind, projectId: conflict.projectId });
  };

  window.addEventListener(PROJECT_VERSION_CONFLICT_EVENT, listener);

  return () => {
    window.removeEventListener(PROJECT_VERSION_CONFLICT_EVENT, listener);
  };
}
