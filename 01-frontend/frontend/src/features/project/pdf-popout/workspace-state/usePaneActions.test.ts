import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfPane } from '../pdfPopout.logic';
import { usePaneActions } from './usePaneActions';

const connectedPane: PdfPane = {
  id: 'connected-pane',
  connected: true,
  documentId: 'connected-doc',
};

describe('usePaneActions', () => {
  beforeEach(() => {
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dedupes documents already open from the sidebar', () => {
    let panes: PdfPane[] = [
      connectedPane,
      { id: 'manual-1', connected: false, documentId: 'manual-doc' },
    ];
    const setPanes = vi.fn((update: React.SetStateAction<PdfPane[]>) => {
      panes = typeof update === 'function' ? update(panes) : update;
    });
    const trackRecentFile = vi.fn();

    const { result } = renderHook(() =>
      usePaneActions({
        panes,
        setPanes,
        connectedFileId: 'connected-doc',
        maxManualLanes: 2,
        trackRecentFile,
        onConnectedPaneSelect: vi.fn(),
      }),
    );

    act(() => result.current.addLaneFromSidebar('manual-doc'));

    expect(trackRecentFile).toHaveBeenCalledWith('manual-doc');
    expect(panes).toEqual([
      connectedPane,
      { id: 'manual-1', connected: false, documentId: 'manual-doc' },
    ]);
  });

  it('adds a manual lane until the cap and then replaces the last manual lane', () => {
    let panes: PdfPane[] = [
      connectedPane,
      { id: 'manual-1', connected: false, documentId: 'first-doc' },
    ];
    const setPanes = vi.fn((update: React.SetStateAction<PdfPane[]>) => {
      panes = typeof update === 'function' ? update(panes) : update;
    });
    const trackRecentFile = vi.fn();

    const { result, rerender } = renderHook(() =>
      usePaneActions({
        panes,
        setPanes,
        connectedFileId: 'connected-doc',
        maxManualLanes: 2,
        trackRecentFile,
        onConnectedPaneSelect: vi.fn(),
      }),
    );

    act(() => result.current.addLaneFromSidebar('second-doc'));
    rerender();
    act(() => result.current.addLaneFromSidebar('third-doc'));

    expect(trackRecentFile).toHaveBeenNthCalledWith(1, 'second-doc');
    expect(trackRecentFile).toHaveBeenNthCalledWith(2, 'third-doc');
    expect(panes).toEqual([
      connectedPane,
      { id: 'manual-1', connected: false, documentId: 'first-doc' },
      {
        id: '00000000-0000-4000-8000-000000000001',
        connected: false,
        documentId: 'third-doc',
      },
    ]);
  });

  it('delegates connected-pane selection instead of mutating the pane directly', () => {
    let panes: PdfPane[] = [connectedPane];
    const setPanes = vi.fn((update: React.SetStateAction<PdfPane[]>) => {
      panes = typeof update === 'function' ? update(panes) : update;
    });
    const trackRecentFile = vi.fn();
    const onConnectedPaneSelect = vi.fn();

    const { result } = renderHook(() =>
      usePaneActions({
        panes,
        setPanes,
        connectedFileId: 'connected-doc',
        maxManualLanes: 2,
        trackRecentFile,
        onConnectedPaneSelect,
      }),
    );

    act(() =>
      result.current.selectPaneDocument('connected-pane', 'replacement-doc'),
    );

    expect(trackRecentFile).toHaveBeenCalledWith('replacement-doc');
    expect(onConnectedPaneSelect).toHaveBeenCalledWith('replacement-doc');
    expect(setPanes).not.toHaveBeenCalled();
    expect(panes).toEqual([connectedPane]);
  });
});
