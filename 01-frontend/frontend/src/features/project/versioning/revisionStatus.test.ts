import { describe, expect, it } from 'vitest';
import {
  areAllSatzStatusesChecked,
  countCheckedSatzStatuses,
  getNextReviewStatus,
  getSparseSatzStatus,
  hasAnySatzStatusNeedsRevision,
  isReviewCompleted,
  isSparseSatzChecked,
  isSatzStatusChecked,
  resolveBulkSatzStatuses,
  setSparseSatzStatus,
  toggleSparseSatzStatus,
} from './revisionStatus';

describe('revisionStatus', () => {
  it('uses the shared review click cycle', () => {
    expect(getNextReviewStatus('unchecked')).toBe('checked');
    expect(getNextReviewStatus('needs_revision')).toBe('checked');
    expect(getNextReviewStatus('checked')).toBe('unchecked');
  });

  it('counts checked and needs_revision as completed', () => {
    expect(isReviewCompleted('checked')).toBe(true);
    expect(isReviewCompleted('needs_revision')).toBe(true);
    expect(isReviewCompleted('unchecked')).toBe(false);
  });

  it('keeps strict checked sentence semantics separate from completion', () => {
    const satzStatuses = {
      'satz-1': 'checked',
      'satz-2': 'needs_revision',
    } as const;

    expect(isSatzStatusChecked('checked')).toBe(true);
    expect(isSatzStatusChecked('needs_revision')).toBe(false);
    expect(isSparseSatzChecked(satzStatuses, 'satz-1')).toBe(true);
    expect(isSparseSatzChecked(satzStatuses, 'satz-2')).toBe(false);
    expect(areAllSatzStatusesChecked(satzStatuses, ['satz-1', 'satz-2'])).toBe(
      false,
    );
    expect(countCheckedSatzStatuses(satzStatuses, ['satz-1', 'satz-2'])).toBe(
      1,
    );
    expect(
      hasAnySatzStatusNeedsRevision(satzStatuses, ['satz-1', 'satz-2']),
    ).toBe(true);
  });

  it('resolves missing sparse sentence entries as unchecked', () => {
    expect(getSparseSatzStatus({}, 'satz-1')).toBe('unchecked');
  });

  it('removes sparse sentence entries when status becomes unchecked', () => {
    expect(
      setSparseSatzStatus({ 'satz-1': 'checked' }, 'satz-1', 'unchecked'),
    ).toEqual({});
  });

  it('filters undefined sparse sentence entries from dense update results', () => {
    expect(
      setSparseSatzStatus(
        { 'satz-1': undefined, 'satz-2': 'checked' },
        'satz-3',
        'needs_revision',
      ),
    ).toEqual({
      'satz-2': 'checked',
      'satz-3': 'needs_revision',
    });
  });

  it('converts needs_revision sentences to checked on toggle', () => {
    expect(
      toggleSparseSatzStatus({ 'satz-1': 'needs_revision' }, 'satz-1'),
    ).toEqual({ 'satz-1': 'checked' });
  });

  it('bulk action resolves needs_revision entries before unchecking completed sentences', () => {
    expect(
      resolveBulkSatzStatuses(
        {
          'satz-1': 'checked',
          'satz-2': 'needs_revision',
        },
        ['satz-1', 'satz-2'],
      ),
    ).toEqual({
      'satz-1': 'checked',
      'satz-2': 'checked',
    });

    expect(
      resolveBulkSatzStatuses(
        {
          'satz-1': 'checked',
          'satz-2': 'checked',
        },
        ['satz-1', 'satz-2'],
      ),
    ).toEqual({});
  });
});
