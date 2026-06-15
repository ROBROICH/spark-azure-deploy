import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOpenRpbPreviewDocument } from './useOpenRpbPreviewDocument';

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => mocks.navigateMock,
  }),
}));

describe('useOpenRpbPreviewDocument', () => {
  beforeEach(() => {
    mocks.navigateMock.mockReset();
  });

  it('sets previewDocumentId and clears the selected Fundstelle', () => {
    const { result } = renderHook(() => useOpenRpbPreviewDocument());

    act(() => {
      result.current('document-1');
    });

    expect(mocks.navigateMock).toHaveBeenCalledWith({
      search: expect.any(Function),
      resetScroll: false,
    });
    expect(
      mocks.navigateMock.mock.calls[0]?.[0].search({
        previewDocumentId: 'old-document',
        selectedFundstelleId: 'fundstelle-1',
        topicId: 'topic-1',
      }),
    ).toEqual({
      previewDocumentId: 'document-1',
      selectedFundstelleId: undefined,
      topicId: 'topic-1',
    });
  });

  it('does not navigate for empty document ids', () => {
    const { result } = renderHook(() => useOpenRpbPreviewDocument());

    act(() => {
      result.current('');
    });

    expect(mocks.navigateMock).not.toHaveBeenCalled();
  });
});
