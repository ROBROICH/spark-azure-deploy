import { describe, expect, it, vi } from 'vitest';
import {
  classifyProjectVersionConflict,
  emitProjectVersionConflict,
  subscribeProjectVersionConflict,
  type ProjectVersionConflict,
} from './projectVersionConflict';

const PROJECT_VERSION_CONFLICT_EVENT = 'spark:project-version-conflict';

describe('classifyProjectVersionConflict', () => {
  it('detects not-latest conflicts from structured codes and backend messages', () => {
    expect(
      classifyProjectVersionConflict({ code: 'VersionNotLatestError' }),
    ).toBe('not_latest');
    expect(
      classifyProjectVersionConflict({
        detail: 'Project version is not latest',
      }),
    ).toBe('not_latest');
    expect(
      classifyProjectVersionConflict({
        message: 'Provided project version 2 is not the latest version 3',
      }),
    ).toBe('not_latest');
  });

  it('detects locked conflicts from structured codes and backend messages', () => {
    expect(
      classifyProjectVersionConflict({ code: 'ProjectVersionLockedError' }),
    ).toBe('version_locked');
    expect(
      classifyProjectVersionConflict({
        detail: 'Project version is locked',
      }),
    ).toBe('version_locked');
    expect(
      classifyProjectVersionConflict({
        message: 'Project version 3 has an active lock',
      }),
    ).toBe('version_locked');
  });

  it('ignores unrelated write conflicts', () => {
    expect(classifyProjectVersionConflict({ detail: 'Duplicate key' })).toBe(
      null,
    );
    expect(classifyProjectVersionConflict('Conflict')).toBe(null);
  });
});

describe('subscribeProjectVersionConflict', () => {
  const dispatchRaw = (detail: unknown) => {
    window.dispatchEvent(
      new CustomEvent(PROJECT_VERSION_CONFLICT_EVENT, { detail }),
    );
  };

  it('invokes the handler for well-formed conflict events', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeProjectVersionConflict(handler);

    emitProjectVersionConflict({ kind: 'not_latest', projectId: 'project-1' });

    unsubscribe();
    expect(handler).toHaveBeenCalledWith({
      kind: 'not_latest',
      projectId: 'project-1',
    });
  });

  it.each([
    { name: 'missing detail', detail: undefined },
    {
      name: 'unknown kind',
      detail: { kind: 'banana', projectId: 'project-1' },
    },
    { name: 'missing projectId', detail: { kind: 'not_latest' } },
    {
      name: 'non-string projectId',
      detail: { kind: 'not_latest', projectId: 42 },
    },
  ])('ignores malformed events: $name', ({ detail }) => {
    const handler = vi.fn();
    const unsubscribe = subscribeProjectVersionConflict(handler);

    dispatchRaw(detail);

    unsubscribe();
    expect(handler).not.toHaveBeenCalled();
  });

  it('stops handling events after unsubscribe', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeProjectVersionConflict(handler);

    unsubscribe();
    emitProjectVersionConflict({
      kind: 'version_locked',
      projectId: 'project-1',
    } satisfies ProjectVersionConflict);

    expect(handler).not.toHaveBeenCalled();
  });
});
