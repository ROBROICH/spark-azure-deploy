export class ProjectTypeCloneDocumentsError extends Error {
  constructor(cause: unknown) {
    super('Project type configuration could not be copied');
    this.name = 'ProjectTypeCloneDocumentsError';
    Object.assign(this, { cause });
  }
}

export class PartialProjectTypeCloneError extends Error {
  readonly projectTypeId: string;
  readonly projectTypeName: string;

  constructor(options: {
    projectTypeId: string;
    projectTypeName: string;
    cause?: unknown;
  }) {
    super('Project type clone is incomplete');
    this.name = 'PartialProjectTypeCloneError';
    this.projectTypeId = options.projectTypeId;
    this.projectTypeName = options.projectTypeName;
    if (options.cause !== undefined) {
      Object.assign(this, { cause: options.cause });
    }
  }
}

export const isProjectTypeCloneDocumentsError = (
  error: unknown,
): error is ProjectTypeCloneDocumentsError =>
  error instanceof ProjectTypeCloneDocumentsError;

export const isPartialProjectTypeCloneError = (
  error: unknown,
): error is PartialProjectTypeCloneError =>
  error instanceof PartialProjectTypeCloneError;
