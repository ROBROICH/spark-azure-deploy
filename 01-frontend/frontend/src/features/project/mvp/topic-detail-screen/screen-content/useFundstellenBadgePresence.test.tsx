import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useFundstellenBadgePresenceForSelection } from './useFundstellenBadgePresence';

const {
  hasAnyFundstellenForDocumentMock,
  hasAnyFundstellenForNormMock,
  hasFundstellenForDocumentAndNormMock,
} = vi.hoisted(() => ({
  hasAnyFundstellenForDocumentMock: vi.fn(),
  hasAnyFundstellenForNormMock: vi.fn(),
  hasFundstellenForDocumentAndNormMock: vi.fn(),
}));

vi.mock('./MvpFundstellenContext', () => ({
  useMvpFundstellenContext: () => ({
    hasAnyFundstellenForDocument: hasAnyFundstellenForDocumentMock,
    hasAnyFundstellenForNorm: hasAnyFundstellenForNormMock,
    hasFundstellenForDocumentAndNorm: hasFundstellenForDocumentAndNormMock,
  }),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: ({ select }: { select: (search: unknown) => unknown }) =>
      select({}),
  }),
}));

describe('useFundstellenBadgePresenceForSelection', () => {
  beforeEach(() => {
    hasAnyFundstellenForDocumentMock.mockReset();
    hasAnyFundstellenForNormMock.mockReset();
    hasFundstellenForDocumentAndNormMock.mockReset();
    hasAnyFundstellenForDocumentMock.mockReturnValue(false);
    hasAnyFundstellenForNormMock.mockReturnValue(false);
    hasFundstellenForDocumentAndNormMock.mockReturnValue(false);
  });

  it('checks document-only and norm-only badge presence', () => {
    hasAnyFundstellenForDocumentMock.mockReturnValueOnce(true);
    hasAnyFundstellenForNormMock.mockReturnValueOnce(true);

    expect(
      renderHook(() =>
        useFundstellenBadgePresenceForSelection({ documentId: 'document-1' }),
      ).result.current,
    ).toBe(true);
    expect(hasAnyFundstellenForDocumentMock).toHaveBeenCalledWith('document-1');

    expect(
      renderHook(() =>
        useFundstellenBadgePresenceForSelection({ normId: 'norm-1' }),
      ).result.current,
    ).toBe(true);
    expect(hasAnyFundstellenForNormMock).toHaveBeenCalledWith('norm-1');
  });

  it('checks explicit and route-filtered document/norm pairs', () => {
    hasFundstellenForDocumentAndNormMock.mockReturnValue(true);

    expect(
      renderHook(() =>
        useFundstellenBadgePresenceForSelection({
          documentId: 'document-1',
          normId: 'norm-1',
        }),
      ).result.current,
    ).toBe(true);
    expect(
      renderHook(() =>
        useFundstellenBadgePresenceForSelection({
          documentId: 'document-1',
          selectedNormId: 'selected-norm-1',
        }),
      ).result.current,
    ).toBe(true);
    expect(
      renderHook(() =>
        useFundstellenBadgePresenceForSelection({
          normId: 'norm-1',
          selectedDocumentId: 'selected-document-1',
        }),
      ).result.current,
    ).toBe(true);
    expect(hasFundstellenForDocumentAndNormMock).toHaveBeenNthCalledWith(
      1,
      'document-1',
      'norm-1',
    );
    expect(hasFundstellenForDocumentAndNormMock).toHaveBeenNthCalledWith(
      2,
      'document-1',
      'selected-norm-1',
    );
    expect(hasFundstellenForDocumentAndNormMock).toHaveBeenNthCalledWith(
      3,
      'selected-document-1',
      'norm-1',
    );
  });

  it('returns false when no badge target is provided', () => {
    expect(
      renderHook(() => useFundstellenBadgePresenceForSelection({})).result
        .current,
    ).toBe(false);
    expect(hasAnyFundstellenForDocumentMock).not.toHaveBeenCalled();
    expect(hasAnyFundstellenForNormMock).not.toHaveBeenCalled();
    expect(hasFundstellenForDocumentAndNormMock).not.toHaveBeenCalled();
  });
});
