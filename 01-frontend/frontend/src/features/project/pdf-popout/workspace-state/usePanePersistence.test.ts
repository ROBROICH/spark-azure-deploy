import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PdfPane } from '../pdfPopout.logic';
import { usePanePersistence } from './usePanePersistence';

const storageKey = (scopeKey: string) => `pdf-popout-panes:${scopeKey}`;

const writeStoredPanes = (scopeKey: string, panes: PdfPane[]) => {
  window.sessionStorage.setItem(
    storageKey(scopeKey),
    JSON.stringify({ panes }),
  );
};

const readStoredPanes = (scopeKey: string) =>
  JSON.parse(window.sessionStorage.getItem(storageKey(scopeKey)) ?? '{}') as {
    panes?: PdfPane[];
  };

describe('usePanePersistence', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.sessionStorage.clear();
  });

  it('hydrates persisted panes per scope, caps manual panes, and syncs the connected pane', async () => {
    writeStoredPanes('scope-a', [
      { id: 'stale-connected', connected: true, documentId: 'stale-doc' },
      { id: 'manual-a-1', connected: false, documentId: 'manual-a-1-doc' },
      { id: 'manual-a-2', connected: false, documentId: 'manual-a-2-doc' },
      { id: 'manual-a-3', connected: false, documentId: 'manual-a-3-doc' },
      { id: 'manual-a-4', connected: false, documentId: 'manual-a-4-doc' },
    ]);
    writeStoredPanes('scope-b', [
      { id: 'manual-b-1', connected: false, documentId: 'manual-b-1-doc' },
    ]);

    const { result, rerender } = renderHook(
      (props: { scopeKey: string; connectedFileId: string | undefined }) =>
        usePanePersistence(props),
      {
        initialProps: {
          scopeKey: 'scope-a',
          connectedFileId: 'connected-a',
        },
      },
    );

    await waitFor(() =>
      expect(result.current.panes).toEqual([
        {
          id: 'connected-pane',
          connected: true,
          documentId: 'connected-a',
        },
        { id: 'manual-a-1', connected: false, documentId: 'manual-a-1-doc' },
        { id: 'manual-a-2', connected: false, documentId: 'manual-a-2-doc' },
        { id: 'manual-a-3', connected: false, documentId: 'manual-a-3-doc' },
      ]),
    );

    rerender({ scopeKey: 'scope-b', connectedFileId: 'connected-b' });

    await waitFor(() =>
      expect(result.current.panes).toEqual([
        {
          id: 'connected-pane',
          connected: true,
          documentId: 'connected-b',
        },
        { id: 'manual-b-1', connected: false, documentId: 'manual-b-1-doc' },
      ]),
    );
  });

  it('persists pane changes back to the active session-storage scope without leaking to another scope', async () => {
    writeStoredPanes('scope-a', [
      { id: 'manual-a-1', connected: false, documentId: 'manual-a-1-doc' },
    ]);
    writeStoredPanes('scope-b', [
      { id: 'manual-b-1', connected: false, documentId: 'manual-b-1-doc' },
    ]);

    const { result } = renderHook(() =>
      usePanePersistence({
        scopeKey: 'scope-a',
        connectedFileId: 'connected-a',
      }),
    );

    await waitFor(() =>
      expect(
        result.current.panes.some((pane) => pane.id === 'manual-a-1'),
      ).toBe(true),
    );

    act(() => {
      result.current.setPanes((panes) => [
        ...panes,
        { id: 'manual-a-2', connected: false, documentId: 'manual-a-2-doc' },
      ]);
    });

    await waitFor(() =>
      expect(readStoredPanes('scope-a').panes).toEqual([
        {
          id: 'connected-pane',
          connected: true,
          documentId: 'connected-a',
        },
        { id: 'manual-a-1', connected: false, documentId: 'manual-a-1-doc' },
        { id: 'manual-a-2', connected: false, documentId: 'manual-a-2-doc' },
      ]),
    );
    expect(readStoredPanes('scope-b').panes).toEqual([
      { id: 'manual-b-1', connected: false, documentId: 'manual-b-1-doc' },
    ]);
  });

  it('keeps the connected pane synced when connectedFileId changes inside a hydrated scope', async () => {
    const { result, rerender } = renderHook(
      (props: { connectedFileId?: string }) =>
        usePanePersistence({
          scopeKey: 'scope-a',
          connectedFileId: props.connectedFileId,
        }),
      { initialProps: { connectedFileId: 'connected-a' } },
    );

    await waitFor(() =>
      expect(result.current.panes[0]).toMatchObject({
        id: 'connected-pane',
        connected: true,
        documentId: 'connected-a',
      }),
    );

    rerender({ connectedFileId: 'connected-a-next' });

    await waitFor(() =>
      expect(result.current.panes[0]).toMatchObject({
        id: 'connected-pane',
        connected: true,
        documentId: 'connected-a-next',
      }),
    );
  });
});
