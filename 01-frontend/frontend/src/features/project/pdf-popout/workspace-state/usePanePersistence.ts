import {
  type Dispatch,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useLocalStorage } from '@/features/shared/browser-storage/useLocalStorage';
import { z } from 'zod';
import {
  arePanesEqual,
  createInitialPdfPanes,
  sanitizePersistedPanes,
  syncConnectedPane,
  type PdfPane,
} from '../pdfPopout.logic';

const PDF_POPOUT_PANES_STORAGE_PREFIX = 'pdf-popout-panes:';

const persistedPdfPaneSchema = z.object({
  id: z.string(),
  documentId: z.string().optional(),
  connected: z.boolean(),
});

const persistedPdfPaneStateSchema = z.object({
  panes: z.array(persistedPdfPaneSchema),
});

type PersistedPdfPaneState = z.infer<typeof persistedPdfPaneStateSchema>;

const getPdfPaneStorageKey = (scopeKey: string) =>
  `${PDF_POPOUT_PANES_STORAGE_PREFIX}${scopeKey || 'global'}`;

type UsePanePersistenceParams = {
  scopeKey: string;
  connectedFileId: string | undefined;
};

type PaneState = {
  connectedFileId: string | undefined;
  panes: PdfPane[];
};

const createPaneState = (
  connectedFileId: string | undefined,
  panes = createInitialPdfPanes(connectedFileId),
): PaneState => ({
  connectedFileId,
  panes,
});

const syncPaneStateConnectedFile = (
  currentState: PaneState,
  connectedFileId: string | undefined,
) => {
  if (currentState.connectedFileId === connectedFileId) {
    return currentState;
  }

  return createPaneState(
    connectedFileId,
    syncConnectedPane(currentState.panes, connectedFileId),
  );
};

const applyPaneStateAction = (
  currentState: PaneState,
  connectedFileId: string | undefined,
  nextPanesAction: SetStateAction<PdfPane[]>,
) => {
  const currentPanes =
    currentState.connectedFileId === connectedFileId
      ? currentState.panes
      : syncConnectedPane(currentState.panes, connectedFileId);
  const nextPanes =
    typeof nextPanesAction === 'function'
      ? nextPanesAction(currentPanes)
      : nextPanesAction;
  const syncedPanes = syncConnectedPane(nextPanes, connectedFileId);

  if (
    currentState.connectedFileId === connectedFileId &&
    arePanesEqual(currentState.panes, syncedPanes)
  ) {
    return currentState;
  }

  return createPaneState(connectedFileId, syncedPanes);
};

/**
 * Manages pane state with sessionStorage persistence. Hydrates the pane layout
 * when the active project changes and persists changes back so the layout
 * survives navigation and page reloads.
 *
 * @param params Project and connected document identifiers.
 * @returns The current panes array and a setter for updating it.
 */
export const usePanePersistence = (params: UsePanePersistenceParams) => {
  const { scopeKey, connectedFileId } = params;
  const hydratedScopeKeyRef = useRef<string | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- pane layout is frame-local ephemeral UI state that must not be mirrored into URL state
  const [paneState, setPaneState] = useState<PaneState>(() =>
    createPaneState(connectedFileId),
  );
  const [persistedPaneState, setPersistedPaneState] = useLocalStorage({
    key: getPdfPaneStorageKey(scopeKey),
    storage: 'session',
    initialValue: {
      panes: createInitialPdfPanes(),
    } satisfies PersistedPdfPaneState,
    schema: persistedPdfPaneStateSchema,
  });
  const syncedPaneState = syncPaneStateConnectedFile(
    paneState,
    connectedFileId,
  );
  const { panes } = syncedPaneState;
  if (syncedPaneState !== paneState) {
    setPaneState(syncedPaneState);
  }

  useLayoutEffect(() => {
    // Hydrate pane state from sessionStorage when the active scope changes so the layout survives navigation.
    if (hydratedScopeKeyRef.current === scopeKey) {
      return;
    }

    hydratedScopeKeyRef.current = scopeKey;
    const nextPanes = sanitizePersistedPanes(
      persistedPaneState.panes,
      connectedFileId,
    );
    setPaneState((currentState) => {
      if (
        currentState.connectedFileId === connectedFileId &&
        arePanesEqual(currentState.panes, nextPanes)
      ) {
        return currentState;
      }

      return createPaneState(connectedFileId, nextPanes);
    });
  }, [connectedFileId, persistedPaneState.panes, scopeKey]);

  // eslint-disable-next-line no-restricted-syntax -- persisting pane layout is an external storage side effect that must run after state changes
  useEffect(() => {
    // Persist the current pane layout to sessionStorage whenever panes change so the layout survives page reload.
    if (!scopeKey) {
      return;
    }

    // eslint-disable-next-line react-you-might-not-need-an-effect/no-pass-live-state-to-parent -- setPersistedPaneState writes into sessionStorage through an external-store hook; this is not parent state synchronization
    setPersistedPaneState({
      panes,
    });
  }, [panes, scopeKey, setPersistedPaneState]);

  const setPanes: Dispatch<SetStateAction<PdfPane[]>> = (nextPanesAction) => {
    setPaneState((currentState) =>
      applyPaneStateAction(currentState, connectedFileId, nextPanesAction),
    );
  };

  return { panes, setPanes };
};
