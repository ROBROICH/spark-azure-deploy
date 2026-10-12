import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useDraftServerBaseline } from './useDraftServerBaseline';

type Document = { value: string };
type TestProps = {
  snapshot: { revision: number };
  baseline: Document;
  draft: Document;
};

const isDirty = (draft: Document, baseline: Document) =>
  draft.value !== baseline.value;

describe('useDraftServerBaseline', () => {
  it('rebases a clean draft when a new server snapshot arrives', async () => {
    const replaceDraft = vi.fn();
    const firstBaseline = { value: 'first' };
    const { rerender } = renderHook(
      (props: TestProps) =>
        useDraftServerBaseline({
          serverSnapshot: props.snapshot,
          serverBaseline: props.baseline,
          draft: props.draft,
          isDirty,
          replaceDraft,
        }),
      {
        initialProps: {
          snapshot: { revision: 1 },
          baseline: firstBaseline,
          draft: firstBaseline,
        },
      },
    );
    const newestBaseline = { value: 'newest' };

    rerender({
      snapshot: { revision: 2 },
      baseline: newestBaseline,
      draft: firstBaseline,
    });

    await waitFor(() => {
      expect(replaceDraft).toHaveBeenCalledWith(newestBaseline);
    });
  });

  it('preserves a dirty draft and restores the newest fetched baseline on discard', async () => {
    const replaceDraft = vi.fn();
    const onPreserveDirtyDraft = vi.fn();
    const firstBaseline = { value: 'first' };
    const dirtyDraft = { value: 'local edit' };
    const { result, rerender } = renderHook(
      (props: TestProps) =>
        useDraftServerBaseline({
          serverSnapshot: props.snapshot,
          serverBaseline: props.baseline,
          draft: props.draft,
          isDirty,
          replaceDraft,
          onPreserveDirtyDraft,
        }),
      {
        initialProps: {
          snapshot: { revision: 1 },
          baseline: firstBaseline,
          draft: dirtyDraft,
        },
      },
    );
    const newestBaseline = { value: 'external edit' };

    rerender({
      snapshot: { revision: 2 },
      baseline: newestBaseline,
      draft: dirtyDraft,
    });

    await waitFor(() => {
      expect(onPreserveDirtyDraft).toHaveBeenCalledTimes(1);
    });
    expect(replaceDraft).not.toHaveBeenCalled();

    act(() => {
      result.current.restoreLatestServerBaseline();
    });

    expect(replaceDraft).toHaveBeenCalledWith(newestBaseline);
  });

  it('keeps the opening snapshot of a dirty draft until it is discarded', async () => {
    const firstSnapshot = { revision: 1 };
    const firstBaseline = { value: 'first' };
    const dirtyDraft = { value: 'local edit' };
    const { result, rerender } = renderHook(
      (props: TestProps) =>
        useDraftServerBaseline({
          serverSnapshot: props.snapshot,
          serverBaseline: props.baseline,
          draft: props.draft,
          isDirty,
          replaceDraft: vi.fn(),
        }),
      {
        initialProps: {
          snapshot: firstSnapshot,
          baseline: firstBaseline,
          draft: dirtyDraft,
        },
      },
    );
    const newestSnapshot = { revision: 2 };

    rerender({
      snapshot: newestSnapshot,
      baseline: { value: 'external edit' },
      draft: dirtyDraft,
    });

    await waitFor(() => {
      expect(result.current.draftSnapshot()).toBe(firstSnapshot);
    });

    act(() => {
      result.current.restoreLatestServerBaseline();
    });

    expect(result.current.draftSnapshot()).toBe(newestSnapshot);
  });

  it('moves a clean draft to the refetched snapshot', async () => {
    const firstBaseline = { value: 'first' };
    const { result, rerender } = renderHook(
      (props: TestProps) =>
        useDraftServerBaseline({
          serverSnapshot: props.snapshot,
          serverBaseline: props.baseline,
          draft: props.draft,
          isDirty,
          replaceDraft: vi.fn(),
        }),
      {
        initialProps: {
          snapshot: { revision: 1 },
          baseline: firstBaseline,
          draft: firstBaseline,
        },
      },
    );
    const newestSnapshot = { revision: 2 };

    rerender({
      snapshot: newestSnapshot,
      baseline: { value: 'newest' },
      draft: firstBaseline,
    });

    await waitFor(() => {
      expect(result.current.draftSnapshot()).toBe(newestSnapshot);
    });
  });

  it('adopts a saved snapshot as the new clean baseline', () => {
    const replaceDraft = vi.fn();
    const firstBaseline = { value: 'first' };
    const dirtyDraft = { value: 'local edit' };
    const { result, rerender } = renderHook(
      (props: TestProps) =>
        useDraftServerBaseline({
          serverSnapshot: props.snapshot,
          serverBaseline: props.baseline,
          draft: props.draft,
          isDirty,
          replaceDraft,
        }),
      {
        initialProps: {
          snapshot: { revision: 1 },
          baseline: firstBaseline,
          draft: dirtyDraft,
        },
      },
    );
    const savedSnapshot = { revision: 2 };

    act(() => {
      result.current.adoptSaved(savedSnapshot, dirtyDraft);
    });
    rerender({
      snapshot: savedSnapshot,
      baseline: dirtyDraft,
      draft: dirtyDraft,
    });

    expect(result.current.draftSnapshot()).toBe(savedSnapshot);
    expect(replaceDraft).toHaveBeenCalledTimes(1);
    expect(replaceDraft).toHaveBeenCalledWith(dirtyDraft);
  });
});
