import { describe, expect, it } from 'vitest';
import { getStartButtonDisabledReason } from './startButtonDisabledReason';

const base = {
  hasProjectFiles: true,
  isProjectFilesError: false,
  isProjectFilesLoading: false,
  isSystemLoadError: false,
  isSystemLoadHigh: false,
};

describe('getStartButtonDisabledReason', () => {
  it('returns undefined when files are present and checks are healthy', () => {
    expect(getStartButtonDisabledReason(base)).toBeUndefined();
  });

  it('reports a files load error rather than missing documents', () => {
    // A failed files read defaults to an empty list, which previously looked
    // identical to a project with no documents.
    expect(
      getStartButtonDisabledReason({
        ...base,
        hasProjectFiles: false,
        isProjectFilesError: true,
      }),
    ).toBe('filesLoadError');
  });

  it('reports a system-load error distinctly', () => {
    expect(
      getStartButtonDisabledReason({ ...base, isSystemLoadError: true }),
    ).toBe('systemLoadError');
  });

  it('prefers the files load error over a system-load error', () => {
    expect(
      getStartButtonDisabledReason({
        ...base,
        isProjectFilesError: true,
        isSystemLoadError: true,
      }),
    ).toBe('filesLoadError');
  });

  it('still reports high system load and missing documents', () => {
    expect(
      getStartButtonDisabledReason({ ...base, isSystemLoadHigh: true }),
    ).toBe('systemLoad');
    expect(
      getStartButtonDisabledReason({ ...base, hasProjectFiles: false }),
    ).toBe('missingDocuments');
  });

  it('does not report missing documents while files are still loading', () => {
    expect(
      getStartButtonDisabledReason({
        ...base,
        hasProjectFiles: false,
        isProjectFilesLoading: true,
      }),
    ).toBeUndefined();
  });
});
