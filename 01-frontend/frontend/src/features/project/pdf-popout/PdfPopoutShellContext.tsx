import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { usePopupWindow } from './workspace-state/usePopupWindow';

const usePdfPopoutShellLogic = () => {
  const { t } = useTranslation('PdfPopout');
  const workspacePopInHandlerRef = useRef<(() => void) | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- the root shell tracks whether any verfahren-scoped workspace is mounted so the reserved popup window can swap between fallback and project content.
  const [activeWorkspaceCount, setActiveWorkspaceCount] = useState(0);

  const setWorkspacePopInHandler = useCallback(
    (handler: (() => void) | null) => {
      workspacePopInHandlerRef.current = handler;
    },
    [],
  );

  const handleWorkspacePopIn = useCallback(() => {
    workspacePopInHandlerRef.current?.();
  }, []);

  const { popupRoot, isPoppedOut, popOut, popIn } = usePopupWindow({
    windowTitle: t('PdfPopoutWindow.windowTitle'),
    onPopIn: handleWorkspacePopIn,
  });

  const activateWorkspace = useCallback(() => {
    setActiveWorkspaceCount((currentCount) => currentCount + 1);
  }, []);

  const deactivateWorkspace = useCallback(() => {
    setActiveWorkspaceCount((currentCount) => Math.max(0, currentCount - 1));
  }, []);

  return useMemo(
    () => ({
      popupRoot,
      isPoppedOut,
      popOut,
      popIn,
      hasActiveWorkspace: activeWorkspaceCount > 0,
      activateWorkspace,
      deactivateWorkspace,
      setWorkspacePopInHandler,
    }),
    [
      activateWorkspace,
      activeWorkspaceCount,
      deactivateWorkspace,
      isPoppedOut,
      popIn,
      popOut,
      popupRoot,
      setWorkspacePopInHandler,
    ],
  );
};

type PdfPopoutShellContextValue = ReturnType<typeof usePdfPopoutShellLogic>;

const PdfPopoutShellContext = createContext<PdfPopoutShellContextValue | null>(
  null,
);

/**
 * App-wide shell that owns the detached popup window and keeps that reserved
 * window alive even when no verfahren route is currently mounted.
 */
export const PdfPopoutProvider = (props: { children: ReactNode }) => {
  const { children } = props;
  const value = usePdfPopoutShellLogic();

  return (
    <PdfPopoutShellContext.Provider value={value}>
      {children}
    </PdfPopoutShellContext.Provider>
  );
};

export const usePdfPopoutShell = () => {
  const context = useContext(PdfPopoutShellContext);
  if (!context) {
    throw new Error('usePdfPopoutShell must be used inside PdfPopoutProvider');
  }

  return context;
};
