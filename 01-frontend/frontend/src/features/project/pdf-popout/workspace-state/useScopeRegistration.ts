import {
  useCallback,
  useInsertionEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  createInitialPdfPanes,
  sanitizePersistedPanes,
  type PdfPane,
} from '../pdfPopout.logic';
import type { DocumentFilter } from './useSidebarState';

export type PdfPopoutRegistration = {
  scopeKey: string;
  projectId: string;
  connectedFileId?: string;
  connectedFilePreview?: {
    title: string;
    isPdf?: boolean;
  };
  onConnectedFileSelect?: (fileId: string) => void;
  topicLabel?: string;
  scopeFileIds?: Set<string>;
  preferredDocumentFilter?: DocumentFilter;
};

type CacheableState = {
  panes: PdfPane[];
  sidebarOpen: boolean;
  documentFilter: DocumentFilter;
};

type UseScopeRegistrationParams = {
  restoreScope: (scopeKey: string) => CacheableState | null;
  cacheScope: (
    scopeKey: string,
    projectId: string,
    state: CacheableState,
  ) => void;
  setPanesRef: React.RefObject<Dispatch<SetStateAction<PdfPane[]>>>;
  setSidebarOpen: Dispatch<SetStateAction<boolean>>;
  setDocumentFilter: Dispatch<SetStateAction<DocumentFilter>>;
  isPoppedOutRef: React.RefObject<boolean>;
  cacheableStateRef: React.RefObject<CacheableState>;
};

/**
 * Owns the scope registration lifecycle: registering a new feature scope
 * (restoring cached layout or creating fresh panes), and clearing it
 * (caching the current layout for later restoration).
 *
 * `setPanesRef` is accepted as a ref because `usePanePersistence` depends on
 * `scopeKey` from this hook, creating a circular init dependency. The ref
 * is always populated before any user interaction triggers registration.
 *
 * @param params Setters for pane/sidebar/filter state and cache hooks.
 * @returns Registration state, derived identifiers, and register/clear callbacks.
 */
// eslint-disable-next-line custom-size/limit-logic-function-lines -- registerScope and clearScope form one cohesive cache-restore-commit transaction; splitting would scatter closure-dependent steps across helpers that only make sense together
export const useScopeRegistration = (params: UseScopeRegistrationParams) => {
  const {
    restoreScope,
    cacheScope,
    setPanesRef,
    setSidebarOpen,
    setDocumentFilter,
    isPoppedOutRef,
    cacheableStateRef,
  } = params;

  const [registration, setRegistration] =
    // eslint-disable-next-line no-restricted-syntax -- registration is workspace coordination state, not URL state
    useState<PdfPopoutRegistration | null>(null);
  const registrationRef = useRef<PdfPopoutRegistration | null>(registration);

  useInsertionEffect(() => {
    registrationRef.current = registration;
  }, [registration]);

  // eslint-disable-next-line no-restricted-syntax -- scope-mounted state tracks whether a feature currently owns the popout registration; it is internal coordination state
  const [isScopeActive, setIsScopeActive] = useState(false);

  const connectedFileId = registration?.connectedFileId;
  const projectId = registration?.projectId ?? '';
  const scopeKey = registration?.scopeKey ?? '';

  // eslint-disable-next-line no-restricted-syntax -- stable identity required: this callback is a useLayoutEffect dependency in useRegisterPdfPopoutScope; without useCallback the effect re-fires every render causing an infinite setState loop
  const registerScope = useCallback(
    (nextRegistration: PdfPopoutRegistration) => {
      const currentRegistration = registrationRef.current;
      const isSameScope =
        currentRegistration?.scopeKey === nextRegistration.scopeKey;

      // Cache the outgoing scope before switching. When the registering
      // component re-renders instead of remounting (RPB topic switch), the
      // useEffect cleanup in useRegisterPdfPopoutScope fires *after* this
      // useLayoutEffect, so clearScope's guard rejects the stale key and
      // the old state is lost. Caching here guarantees the old layout is
      // persisted regardless of effect ordering.
      if (!isSameScope && currentRegistration) {
        cacheScope(
          currentRegistration.scopeKey,
          currentRegistration.projectId,
          cacheableStateRef.current,
        );
      }

      const cached = restoreScope(nextRegistration.scopeKey);
      const nextDocumentFilter =
        nextRegistration.preferredDocumentFilter ??
        cached?.documentFilter ??
        'all';
      const nextConnectedFileId =
        nextRegistration.connectedFileId ??
        (isSameScope ? currentRegistration.connectedFileId : undefined);

      if (cached) {
        setSidebarOpen(cached.sidebarOpen);
        setDocumentFilter(nextDocumentFilter);
        setPanesRef.current(
          sanitizePersistedPanes(cached.panes, nextConnectedFileId),
        );
      } else {
        setSidebarOpen(true);
        setDocumentFilter(nextDocumentFilter);
        setPanesRef.current(createInitialPdfPanes(nextConnectedFileId));
      }

      setRegistration((current) => ({
        ...nextRegistration,
        connectedFileId:
          nextConnectedFileId ??
          (current?.scopeKey === nextRegistration.scopeKey
            ? current.connectedFileId
            : undefined),
      }));
      setIsScopeActive(true);
    },
    [
      cacheScope,
      cacheableStateRef,
      registrationRef,
      restoreScope,
      setDocumentFilter,
      setPanesRef,
      setSidebarOpen,
    ],
  );

  // eslint-disable-next-line no-restricted-syntax -- stable identity required: this callback is a useEffect cleanup dependency in useRegisterPdfPopoutScope; without useCallback the cleanup would reference a stale closure on every render
  const clearScope = useCallback(
    (clearedScopeKey: string) => {
      const currentRegistration = registrationRef.current;
      if (currentRegistration?.scopeKey !== clearedScopeKey) {
        return;
      }

      // Cache current state before clearing so it can be restored when the user navigates back.
      cacheScope(
        clearedScopeKey,
        currentRegistration.projectId,
        cacheableStateRef.current,
      );
      setIsScopeActive(false);

      if (!isPoppedOutRef.current) {
        setRegistration(null);
      }
    },
    [cacheScope, cacheableStateRef, isPoppedOutRef, registrationRef],
  );

  return {
    registration,
    registrationRef,
    setRegistration,
    isScopeActive,
    connectedFileId,
    projectId,
    scopeKey,
    registerScope,
    clearScope,
  };
};
