import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useDocumentsTableActions } from './useDocumentsTableActions';

const {
  confirmDocumentTypeMock,
  navigateMock,
  notifyOnPersistenceFailureMock,
  setDocumentTypeMock,
} = vi.hoisted(() => ({
  confirmDocumentTypeMock: vi.fn(),
  navigateMock: vi.fn(),
  notifyOnPersistenceFailureMock: vi.fn(),
  setDocumentTypeMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => navigateMock,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock(
  '@/features/project/fvp/main-screen/data/actions/documentActions',
  () => ({
    confirmDocumentType: confirmDocumentTypeMock,
    setDocumentType: setDocumentTypeMock,
  }),
);

vi.mock(
  '@/features/project/fvp/main-screen/read-status/notifyOnPersistenceFailure',
  () => ({
    notifyOnPersistenceFailure: notifyOnPersistenceFailureMock,
  }),
);

const VERFAHREN_ID = 'verfahren-1';

const renderActions = (canMutateProject: boolean) =>
  renderHook(() =>
    useDocumentsTableActions({ canMutateProject, verfahrenId: VERFAHREN_ID }),
  ).result;

afterEach(() => {
  vi.clearAllMocks();
});

describe('useDocumentsTableActions', () => {
  describe('handleFileClick', () => {
    it('opens the preview for the clicked document regardless of mutation rights', () => {
      const { current } = renderActions(false);

      current.handleFileClick('document-1');

      expect(navigateMock).toHaveBeenCalledTimes(1);
      const [navigateArgs] = navigateMock.mock.calls[0] ?? [];
      expect(navigateArgs.resetScroll).toBe(false);
      expect(navigateArgs.search({ existing: 'value' })).toEqual({
        existing: 'value',
        previewDocumentId: 'document-1',
      });
    });
  });

  describe('handleRequestDocument', () => {
    it('opens the request list with the document source when project edits are allowed', () => {
      const { current } = renderActions(true);

      current.handleRequestDocument(
        'U01_Erlaeuterungsbericht.pdf',
        'document-1',
        'tableOfContents',
      );

      expect(navigateMock).toHaveBeenCalledTimes(1);
      const [navigateArgs] = navigateMock.mock.calls[0] ?? [];
      expect(navigateArgs.replace).toBe(true);
      expect(navigateArgs.resetScroll).toBe(false);
      expect(navigateArgs.search({ keep: 'me' })).toEqual({
        keep: 'me',
        sidebarPanel: 'requestList',
        newRequestListInitItems: [
          {
            title: 'U01_Erlaeuterungsbericht.pdf',
            sourceRef: {
              type: 'tableOfContents',
              itemId: 'document-1',
            },
          },
        ],
      });
    });

    it('defaults the request source to requiredDocuments when none is given', () => {
      const { current } = renderActions(true);

      current.handleRequestDocument('Doc.pdf', 'document-2');

      const [navigateArgs] = navigateMock.mock.calls[0] ?? [];
      expect(navigateArgs.replace).toBe(true);
      expect(navigateArgs.search({})).toEqual({
        sidebarPanel: 'requestList',
        newRequestListInitItems: [
          {
            title: 'Doc.pdf',
            sourceRef: {
              type: 'requiredDocuments',
              itemId: 'document-2',
            },
          },
        ],
      });
    });

    it('is a no-op when project edits are read-only', () => {
      const { current } = renderActions(false);

      current.handleRequestDocument('Doc.pdf', 'document-2', 'tableOfContents');

      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  describe('handleAddComment', () => {
    it('opens the comment sidebar for the document title when project edits are allowed', () => {
      const { current } = renderActions(true);

      current.handleAddComment('U01_Erlaeuterungsbericht.pdf');

      expect(navigateMock).toHaveBeenCalledTimes(1);
      const [navigateArgs] = navigateMock.mock.calls[0] ?? [];
      expect(navigateArgs.replace).toBe(true);
      expect(navigateArgs.resetScroll).toBe(false);
      expect(navigateArgs.search({ keep: 'me' })).toEqual({
        keep: 'me',
        sidebarPanel: 'comments',
        newCommentInitItems: [{ title: 'U01_Erlaeuterungsbericht.pdf' }],
      });
    });

    it('is a no-op when project edits are read-only', () => {
      const { current } = renderActions(false);

      current.handleAddComment('U01_Erlaeuterungsbericht.pdf');

      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  describe('handleManageCustomDocumentTypes', () => {
    it('opens the edit-required-documents dialog when project edits are allowed', () => {
      const { current } = renderActions(true);

      current.handleManageCustomDocumentTypes();

      expect(navigateMock).toHaveBeenCalledTimes(1);
      const [navigateArgs] = navigateMock.mock.calls[0] ?? [];
      expect(navigateArgs.replace).toBe(true);
      expect(navigateArgs.resetScroll).toBe(false);
      expect(navigateArgs.search({ keep: 'me' })).toEqual({
        keep: 'me',
        isEditRequiredDocumentsDialogOpen: true,
      });
    });

    it('is a no-op when project edits are read-only', () => {
      const { current } = renderActions(false);

      current.handleManageCustomDocumentTypes();

      expect(navigateMock).not.toHaveBeenCalled();
    });
  });

  describe('handleConfirmDocumentType', () => {
    it('confirms the AI-suggested document type and guards persistence when allowed', () => {
      const transaction = { isPersisted: { promise: Promise.resolve() } };
      confirmDocumentTypeMock.mockReturnValue(transaction);

      const { current } = renderActions(true);

      current.handleConfirmDocumentType('document-1');

      expect(confirmDocumentTypeMock).toHaveBeenCalledWith(
        VERFAHREN_ID,
        'document-1',
      );
      expect(notifyOnPersistenceFailureMock).toHaveBeenCalledWith(
        transaction,
        'common.errors.actionFailed',
      );
    });

    it('is a no-op when project edits are read-only', () => {
      const { current } = renderActions(false);

      current.handleConfirmDocumentType('document-1');

      expect(confirmDocumentTypeMock).not.toHaveBeenCalled();
      expect(notifyOnPersistenceFailureMock).not.toHaveBeenCalled();
    });
  });

  describe('handleSelectDocumentType', () => {
    it('sets the chosen document type and guards persistence when allowed', () => {
      const transaction = { isPersisted: { promise: Promise.resolve() } };
      setDocumentTypeMock.mockReturnValue(transaction);

      const { current } = renderActions(true);

      current.handleSelectDocumentType('document-1', 'type-7');

      expect(setDocumentTypeMock).toHaveBeenCalledWith(
        VERFAHREN_ID,
        'document-1',
        'type-7',
      );
      expect(notifyOnPersistenceFailureMock).toHaveBeenCalledWith(
        transaction,
        'common.errors.actionFailed',
      );
    });

    it('is a no-op when project edits are read-only', () => {
      const { current } = renderActions(false);

      current.handleSelectDocumentType('document-1', 'type-7');

      expect(setDocumentTypeMock).not.toHaveBeenCalled();
      expect(notifyOnPersistenceFailureMock).not.toHaveBeenCalled();
    });
  });
});
