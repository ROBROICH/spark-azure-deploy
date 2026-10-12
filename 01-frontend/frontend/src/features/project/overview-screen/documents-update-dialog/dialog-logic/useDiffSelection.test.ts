import type { FileDiffResponse } from '@/api-clients/backend';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useDiffSelection } from './useDiffSelection';

const emptyDiff: FileDiffResponse = {
  new: [],
  changed: [],
  renamed: [],
  deleted: [],
  unchanged: [],
};

describe('useDiffSelection', () => {
  it('keeps an upload with only new files confirmable without any selectable row', () => {
    const { result } = renderHook(() =>
      useDiffSelection({
        ...emptyDiff,
        new: [{ filename: 'plan-c.pdf', bucketPath: 'bucket/c', sha: 'sha-c' }],
      }),
    );

    expect(result.current.selectableTotal).toBe(0);
    expect(result.current.hasIncludedChanges).toBe(true);
  });

  it('reports no included changes when the upload only contains unchanged files', () => {
    const { result } = renderHook(() =>
      useDiffSelection({
        ...emptyDiff,
        unchanged: [{ fileId: 'file-4', filename: 'plan-e.pdf', sha: 'sha-e' }],
      }),
    );

    expect(result.current.hasIncludedChanges).toBe(false);
  });
});
