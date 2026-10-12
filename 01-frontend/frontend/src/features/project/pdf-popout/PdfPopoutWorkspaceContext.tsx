/* eslint-disable max-lines -- workspace context composer file; logic is already decomposed into sub-hooks, remaining size is provider wiring and connected-document navigation */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useInsertionEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import {
  countTreeDocuments,
  filterTreeByDocumentIds,
  syncConnectedPane,
  type PdfPane,
} from './pdfPopout.logic';
import { usePdfPopoutShell } from './PdfPopoutShellContext';
import { useMaxManualLanes } from './workspace-state/useMaxManualLanes';
import { usePaneActions } from './workspace-state/usePaneActions';
import { usePanePersistence } from './workspace-state/usePanePersistence';
import { useProjectPdfFiles } from './workspace-state/useProjectPdfFiles';
import { useRecentDocuments } from './workspace-state/useRecentDocuments';
import {
  useScopeRegistration,
  type PdfPopoutRegistration,
} from './workspace-state/useScopeRegistration';
import { useScopePersistence } from './workspace-state/useScopePersistence';
import { useSidebarState } from './workspace-state/useSidebarState';

type ConnectedPageJump = {
  documentId: string;
  pageNumber: number;
  requestKey: number;
};

const EMPTY_PANES: PdfPane[] = [];

/**
 * Composes sub-hooks for sidebar state, pane actions, and scope registration
 * into the full workspace context. Owns connected-document coordination and
 * the bridge back into the root popup shell.
 *
 * @returns The full workspace context value consumed by PdfPopout components.
 */
// eslint-disable-next-line custom-size/limit-logic-function-lines -- thin composer wiring sub-hooks (usePaneActions, useScopeRegistration, useSidebarState) plus connected-document navigation; further splitting would add indirection without reducing complexity
const usePdfPopoutWorkspaceLogic = () => {
  const {
    popupRoot,
    isPoppedOut,
    popOut: popOutWindow,
    popIn: popInWindow,
    activateWorkspace,
    deactivateWorkspace,
    setWorkspacePopInHandler,
  } = usePdfPopoutShell();

  // eslint-disable-next-line no-restricted-syntax -- file catalogue loading is lazily requested by transient tree UI controls, not shareable route state
  const [isFileCatalogRequested, setIsFileCatalogRequested] = useState(false);
  const {
    tree,
    isLoading,
    isError: isFilesError,
    previewById,
    filePagination,
  } = useProjectPdfFiles({
    enabled: isFileCatalogRequested || isPoppedOut,
  });

  const { cacheScope, restoreScope } = useScopePersistence();
  const isPoppedOutRef = useRef(isPoppedOut);

  // Scope registration is initialised before sidebar has topic data. The
  // sidebar receives topic metadata from the resolved registration below.
  // setPanesRef breaks the circular init dependency: useScopeRegistration needs
  // setPanes, but usePanePersistence needs scopeKey from useScopeRegistration.
  // The ref is populated immediately after usePanePersistence and is always
  // current before any user interaction triggers registerScope.
  const setPanesRef = useRef<Dispatch<SetStateAction<PdfPane[]>>>(() => {});

  const {
    sidebarOpen,
    setSidebarOpen,
    documentFilter,
    setDocumentFilter,
    toggleSidebar,
  } = useSidebarState();

  const cacheableStateRef = useRef({
    panes: EMPTY_PANES,
    sidebarOpen: sidebarOpen,
    documentFilter: documentFilter,
  });

  const scope = useScopeRegistration({
    restoreScope,
    cacheScope,
    setPanesRef,
    setSidebarOpen: setSidebarOpen,
    setDocumentFilter: setDocumentFilter,
    isPoppedOutRef,
    cacheableStateRef,
  });

  const {
    connectedFileId,
    projectId,
    scopeKey,
    registration,
    isScopeActive,
    setRegistration,
    clearScope,
    registerScope,
  } = scope;

  const { panes, setPanes } = usePanePersistence({
    scopeKey,
    connectedFileId,
  });

  useInsertionEffect(() => {
    setPanesRef.current = setPanes;
  }, [setPanes, setPanesRef]);

  useLayoutEffect(() => {
    isPoppedOutRef.current = isPoppedOut;
    cacheableStateRef.current = {
      panes,
      sidebarOpen: sidebarOpen,
      documentFilter: documentFilter,
    };
  }, [
    cacheableStateRef,
    documentFilter,
    isPoppedOut,
    isPoppedOutRef,
    panes,
    sidebarOpen,
  ]);

  const topicLabel = registration?.topicLabel;
  const scopeFileIds = registration?.scopeFileIds;
  const registeredConnectedFilePreview = registration?.connectedFilePreview;
  const filteredTree =
    documentFilter === 'topic' && scopeFileIds
      ? filterTreeByDocumentIds(tree, scopeFileIds)
      : tree;
  const allDocumentCount = countTreeDocuments(tree);
  const topicDocumentCount = scopeFileIds ? scopeFileIds.size : 0;

  const { recentDocuments: storedRecentDocuments, addRecentDocument } =
    useRecentDocuments(projectId);
  const documentPreviewById = useMemo(() => {
    if (!connectedFileId || !registeredConnectedFilePreview) {
      return previewById;
    }

    const nextPreviewById = new Map(previewById);
    if (!nextPreviewById.has(connectedFileId)) {
      nextPreviewById.set(connectedFileId, {
        title: registeredConnectedFilePreview.title,
        isPdf: registeredConnectedFilePreview.isPdf ?? true,
      });
    }

    return nextPreviewById;
  }, [connectedFileId, previewById, registeredConnectedFilePreview]);

  // eslint-disable-next-line no-restricted-syntax -- inlineVisible is ephemeral UI state that controls whether the inline PDF frame is shown, not shareable via URL
  const [inlineVisible, setInlineVisible] = useState(false);
  const [connectedPageJump, setConnectedPageJump] =
    // eslint-disable-next-line no-restricted-syntax -- connected-page jumps are transient viewer coordination state, not URL-worthy or persisted workspace state
    useState<ConnectedPageJump | null>(null);
  const pageJumpRequestKeyRef = useRef(0);

  const popupWindow = popupRoot?.ownerDocument.defaultView ?? null;
  const maxManualLanes = useMaxManualLanes(popupWindow);

  const recentDocuments = useMemo(
    () =>
      storedRecentDocuments.flatMap((entry) => {
        const preview = documentPreviewById.get(entry.documentId);
        return preview
          ? [{ documentId: entry.documentId, title: preview.title }]
          : [];
      }),
    [documentPreviewById, storedRecentDocuments],
  );

  const trackRecentFile = useCallback(
    (fileId: string) => {
      if (documentPreviewById.has(fileId)) {
        addRecentDocument(fileId);
      }
    },
    [addRecentDocument, documentPreviewById],
  );

  const openConnectedFile = useCallback(
    (fileId: string) => {
      if (!registration) {
        return;
      }

      pageJumpRequestKeyRef.current += 1;
      setConnectedPageJump({
        documentId: fileId,
        pageNumber: 1,
        requestKey: pageJumpRequestKeyRef.current,
      });
      trackRecentFile(fileId);
      setInlineVisible(true);
      if (!isScopeActive) {
        setRegistration((current) =>
          current ? { ...current, connectedFileId: fileId } : current,
        );
        setPanes((prev: PdfPane[]) => syncConnectedPane(prev, fileId));
        return;
      }

      setRegistration((current) =>
        current ? { ...current, connectedFileId: fileId } : current,
      );
      setPanes((prev: PdfPane[]) => syncConnectedPane(prev, fileId));
      registration.onConnectedFileSelect?.(fileId);
    },
    [isScopeActive, registration, setPanes, trackRecentFile, setRegistration],
  );

  const paneActions = usePaneActions({
    panes,
    setPanes,
    connectedFileId: connectedFileId,
    maxManualLanes,
    trackRecentFile,
    onConnectedPaneSelect: openConnectedFile,
  });

  const jumpToConnectedFilePage = useCallback(
    (pageNumber: number, fileId?: string) => {
      const targetFileId = fileId ?? connectedFileId;

      if (!targetFileId || pageNumber < 1) {
        return;
      }

      pageJumpRequestKeyRef.current += 1;
      setConnectedPageJump({
        documentId: targetFileId,
        pageNumber,
        requestKey: pageJumpRequestKeyRef.current,
      });
    },
    [connectedFileId],
  );

  // eslint-disable-next-line no-restricted-syntax -- workspace mount state must be mirrored into the root shell so the reserved popup content can hand off to project-scoped content across route changes.
  useEffect(() => {
    activateWorkspace();

    return () => {
      deactivateWorkspace();
    };
  }, [activateWorkspace, deactivateWorkspace]);

  const handleShellPopIn = useCallback(() => {
    setInlineVisible(Boolean(scope.registrationRef.current?.connectedFileId));
  }, [scope.registrationRef]);

  // eslint-disable-next-line no-restricted-syntax -- the root shell stores a single active workspace pop-in handler because only one verfahren workspace can own the popup at a time.
  useEffect(() => {
    setWorkspacePopInHandler(handleShellPopIn);

    return () => {
      setWorkspacePopInHandler(null);
    };
  }, [handleShellPopIn, setWorkspacePopInHandler]);

  const popOut = useCallback(() => {
    setIsFileCatalogRequested(true);
    const isPopOutOpen = popOutWindow();
    if (isPopOutOpen) {
      setInlineVisible(false);
    }
  }, [popOutWindow]);

  const requestFileCatalog = useCallback(() => {
    setIsFileCatalogRequested(true);
  }, []);

  const clearScopeWithInlineReset = useCallback(
    (clearedScopeKey: string) => {
      clearScope(clearedScopeKey);
      if (!isPoppedOutRef.current) {
        setInlineVisible(false);
      }
    },
    [clearScope],
  );

  return useMemo(
    () => ({
      projectId,
      scopeKey,
      tree: filteredTree,
      allTree: tree,
      isLoadingFiles: isLoading,
      isFilesError,
      filePagination,
      connectedFileId,
      inlineVisible,
      isPoppedOut,
      panes,
      popupRoot,
      recentDocuments,
      sidebarOpen: sidebarOpen,
      maxManualLanes,
      documentFilter: documentFilter,
      setDocumentFilter: setDocumentFilter,
      topicLabel,
      allDocumentCount,
      topicDocumentCount,
      documentPreviewById,
      connectedPageJump,
      registerScope: registerScope,
      clearScope: clearScopeWithInlineReset,
      openConnectedFile,
      jumpToConnectedFilePage,
      requestFileCatalog,
      closeInline: () => setInlineVisible(false),
      popOut,
      popIn: popInWindow,
      addPane: paneActions.addPane,
      addLaneFromSidebar: paneActions.addLaneFromSidebar,
      closePane: paneActions.closePane,
      selectPaneDocument: paneActions.selectPaneDocument,
      toggleSidebar: toggleSidebar,
    }),
    [
      paneActions.addLaneFromSidebar,
      paneActions.addPane,
      allDocumentCount,
      clearScopeWithInlineReset,
      paneActions.closePane,
      connectedPageJump,
      connectedFileId,
      documentFilter,
      setDocumentFilter,
      documentPreviewById,
      filteredTree,
      inlineVisible,
      isFilesError,
      filePagination,
      isLoading,
      isPoppedOut,
      maxManualLanes,
      openConnectedFile,
      jumpToConnectedFilePage,
      panes,
      popInWindow,
      popOut,
      popupRoot,
      projectId,
      recentDocuments,
      registerScope,
      requestFileCatalog,
      scopeKey,
      paneActions.selectPaneDocument,
      sidebarOpen,
      toggleSidebar,
      topicDocumentCount,
      topicLabel,
      tree,
    ],
  );
};

type PdfPopoutWorkspaceContextValue = ReturnType<
  typeof usePdfPopoutWorkspaceLogic
>;

const PdfPopoutWorkspaceContext =
  createContext<PdfPopoutWorkspaceContextValue | null>(null);

/**
 * Verfahren-scoped workspace that owns pane layout, file-tree data, and the
 * registration bridge from RPB/MVP into the shared popup shell.
 */
export const PdfPopoutWorkspaceProvider = (props: { children: ReactNode }) => {
  const { children } = props;
  const value = usePdfPopoutWorkspaceLogic();

  return (
    <PdfPopoutWorkspaceContext.Provider value={value}>
      {children}
    </PdfPopoutWorkspaceContext.Provider>
  );
};

export const usePdfPopout = () => {
  const context = useContext(PdfPopoutWorkspaceContext);
  if (!context) {
    throw new Error(
      'usePdfPopout must be used inside PdfPopoutWorkspaceProvider',
    );
  }

  return context;
};

export const useRegisterPdfPopoutScope = (
  registration: PdfPopoutRegistration,
) => {
  const { registerScope, clearScope } = usePdfPopout();
  const {
    scopeKey,
    projectId,
    connectedFileId,
    connectedFilePreview,
    onConnectedFileSelect,
    topicLabel,
    scopeFileIds,
    preferredDocumentFilter,
  } = registration;
  const connectedFilePreviewTitle = connectedFilePreview?.title;
  const connectedFilePreviewIsPdf = connectedFilePreview?.isPdf;

  useLayoutEffect(() => {
    registerScope({
      scopeKey,
      projectId,
      connectedFileId,
      connectedFilePreview:
        connectedFilePreviewTitle === undefined
          ? undefined
          : {
              title: connectedFilePreviewTitle,
              isPdf: connectedFilePreviewIsPdf,
            },
      onConnectedFileSelect,
      topicLabel,
      scopeFileIds,
      preferredDocumentFilter,
    });
  }, [
    connectedFileId,
    connectedFilePreviewIsPdf,
    connectedFilePreviewTitle,
    onConnectedFileSelect,
    preferredDocumentFilter,
    projectId,
    registerScope,
    scopeKey,
    scopeFileIds,
    topicLabel,
  ]);

  // eslint-disable-next-line no-restricted-syntax -- scope cleanup must run on unmount so cached workspace state is preserved per feature scope
  useEffect(() => {
    return () => {
      clearScope(scopeKey);
    };
  }, [clearScope, scopeKey]);
};
