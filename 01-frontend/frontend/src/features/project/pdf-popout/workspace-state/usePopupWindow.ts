import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import { POPUP_WINDOW_NAME } from '../pdfPopout.logic';

const POPUP_ROOT_ID = 'project-pdf-popout-root';
const POPPED_OUT_STORAGE_KEY = 'pdf-popout-is-popped-out';

const readPoppedOutFlag = (): boolean => {
  try {
    return window.localStorage.getItem(POPPED_OUT_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
};

const writePoppedOutFlag = (value: boolean) => {
  try {
    if (value) {
      window.localStorage.setItem(POPPED_OUT_STORAGE_KEY, 'true');
    } else {
      window.localStorage.removeItem(POPPED_OUT_STORAGE_KEY);
    }
  } catch {
    // Silently ignore storage quota errors.
  }
};

const cloneHeadStyles = (source: Document, target: Document) => {
  // Safe: copies only our own app's style/link nodes into the popup we control.
  target.head.replaceChildren();
  const styleNodes = source.querySelectorAll<
    HTMLStyleElement | HTMLLinkElement
  >('style, link[rel="stylesheet"]');

  for (const styleNode of styleNodes) {
    target.head.appendChild(styleNode.cloneNode(true));
  }
};

const cloneThemeClasses = (source: Document, target: Document) => {
  target.documentElement.className = source.documentElement.className;
  target.body.className = source.body.className;
};

const createPopupRoot = (popupWindow: Window) => {
  const popupDocument = popupWindow.document;
  const existingRoot = popupDocument.getElementById(POPUP_ROOT_ID);
  if (existingRoot) {
    existingRoot.remove();
  }

  const root = popupDocument.createElement('div');
  root.id = POPUP_ROOT_ID;
  root.style.height = '100vh';
  root.style.width = '100%';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  popupDocument.body.style.margin = '0';
  popupDocument.body.style.height = '100vh';
  popupDocument.body.style.overflow = 'hidden';
  popupDocument.body.appendChild(root);

  return root;
};

/**
 * Probes for an existing popup window left over from a previous page load
 * (e.g. after the user refreshes the main window). Uses window.open with an
 * empty URL and the same window name — browsers return a reference to the
 * existing window instead of creating a new one.
 *
 * @returns The existing popup Window, or null if none was found.
 */
const findExistingPopupWindow = (): Window | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const existingPopup = window.open('', POPUP_WINDOW_NAME);
    if (!existingPopup || existingPopup.closed) {
      return null;
    }

    if (existingPopup.document.getElementById(POPUP_ROOT_ID)) {
      return existingPopup;
    }

    existingPopup.close();
    return null;
  } catch {
    return null;
  }
};

type UsePopupWindowParams = {
  windowTitle: string;
  onPopIn: () => void;
};

type PopupBeforeUnloadEffectParams = {
  clearPopupWindowRef: () => void;
  isPoppedOut: boolean;
  onPopIn: () => void;
  popupWindowRef: RefObject<Window | null>;
  setIsPoppedOut: Dispatch<SetStateAction<boolean>>;
  setPopupRoot: Dispatch<SetStateAction<HTMLElement | null>>;
};

/**
 * Subscribes to the detached window lifecycle so closing the popup restores
 * the inline viewer state in the main application window.
 *
 * @param params Window refs, state setters, and pop-in callback for the popup lifecycle.
 * @returns Nothing. The hook registers and cleans up a `beforeunload` listener.
 */
const usePopupBeforeUnloadEffect = (params: PopupBeforeUnloadEffectParams) => {
  const {
    clearPopupWindowRef,
    isPoppedOut,
    onPopIn,
    popupWindowRef,
    setIsPoppedOut,
    setPopupRoot,
  } = params;

  // eslint-disable-next-line no-restricted-syntax -- cross-window event subscription requires an effect; there is no React-native API for subscribing to a detached window's lifecycle
  useEffect(() => {
    const popupWindow = popupWindowRef.current;
    if (!popupWindow) {
      return;
    }

    const handleBeforeUnload = () => {
      clearPopupWindowRef();
      setPopupRoot(null);
      setIsPoppedOut(false);
      writePoppedOutFlag(false);
      onPopIn();
    };

    popupWindow.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      popupWindow.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [
    clearPopupWindowRef,
    isPoppedOut,
    onPopIn,
    popupWindowRef,
    setIsPoppedOut,
    setPopupRoot,
  ]);
};

type ReclaimPopupWindowEffectParams = {
  popupWindowRef: RefObject<Window | null>;
  setIsPoppedOut: Dispatch<SetStateAction<boolean>>;
  setPopupRoot: Dispatch<SetStateAction<HTMLElement | null>>;
  setupPopupWindow: (popupWindow: Window, shouldFocus?: boolean) => HTMLElement;
};

/**
 * Reclaims a detached popup window that survived a main-window refresh so the
 * shared PDF workspace can continue rendering into it.
 *
 * @param params Window refs, popup root setter, and popup setup callback.
 * @returns Nothing. The hook restores popup state when an orphaned window is found.
 */
const useReclaimPopupWindowEffect = (
  params: ReclaimPopupWindowEffectParams,
) => {
  const { popupWindowRef, setIsPoppedOut, setPopupRoot, setupPopupWindow } =
    params;

  // eslint-disable-next-line no-restricted-syntax -- orphaned popup reclaim must run once on mount and restore detached-window state after a page refresh
  useEffect(() => {
    if (popupWindowRef.current) {
      return;
    }

    if (!readPoppedOutFlag()) {
      return;
    }

    const existingPopup = findExistingPopupWindow();
    if (!existingPopup) {
      writePoppedOutFlag(false);
      return;
    }

    const nextRoot = setupPopupWindow(existingPopup, false);
    setPopupRoot(nextRoot);
    setIsPoppedOut(true);
    writePoppedOutFlag(true);
  }, [popupWindowRef, setIsPoppedOut, setPopupRoot, setupPopupWindow]);
};

type PopupWindowActionsParams = {
  clearPopupWindowRef: () => void;
  onPopIn: () => void;
  popupWindowRef: RefObject<Window | null>;
  setIsPoppedOut: Dispatch<SetStateAction<boolean>>;
  setPopupRoot: Dispatch<SetStateAction<HTMLElement | null>>;
  setupPopupWindow: (popupWindow: Window, shouldFocus?: boolean) => HTMLElement;
};

/**
 * Builds the stable popup window actions consumed by the shared PDF popout
 * context and popup lifecycle effects.
 *
 * @param params Window refs, state setters, and popup setup callback.
 * @returns Stable callbacks for popping in/out and clearing the window ref.
 */
const usePopupWindowActions = (params: PopupWindowActionsParams) => {
  const {
    clearPopupWindowRef,
    onPopIn,
    popupWindowRef,
    setIsPoppedOut,
    setPopupRoot,
    setupPopupWindow,
  } = params;

  // eslint-disable-next-line no-restricted-syntax -- stable identity required so the beforeunload effect can add and remove the same listener reference across renders
  const closePopupWindow = useCallback(() => {
    const popupWindow = popupWindowRef.current;

    if (popupWindow && !popupWindow.closed) {
      popupWindow.close();
    }

    clearPopupWindowRef();
    setPopupRoot(null);
  }, [clearPopupWindowRef, popupWindowRef, setPopupRoot]);

  // eslint-disable-next-line no-restricted-syntax -- stable identity required so popOut's dependency array does not change on every render
  const openPopupWindow = useCallback(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    const existingPopup = popupWindowRef.current;
    if (existingPopup && !existingPopup.closed) {
      existingPopup.focus();
      return createPopupRoot(existingPopup);
    }

    const popupWindow = window.open(
      '',
      POPUP_WINDOW_NAME,
      'popup=yes,width=1600,height=1000',
    );
    if (!popupWindow) {
      return null;
    }

    return setupPopupWindow(popupWindow);
  }, [popupWindowRef, setupPopupWindow]);

  // eslint-disable-next-line no-restricted-syntax -- stable identity required so consumers of popOut do not re-register effects on every render
  const popOut = useCallback(() => {
    const nextPopupRoot = openPopupWindow();
    if (!nextPopupRoot) {
      return false;
    }

    setPopupRoot(nextPopupRoot);
    setIsPoppedOut(true);
    writePoppedOutFlag(true);
    return true;
  }, [openPopupWindow, setIsPoppedOut, setPopupRoot]);

  // eslint-disable-next-line no-restricted-syntax -- stable identity required so consumers of popIn do not re-register effects on every render
  const popIn = useCallback(() => {
    setIsPoppedOut(false);
    writePoppedOutFlag(false);
    closePopupWindow();
    onPopIn();
  }, [closePopupWindow, onPopIn, setIsPoppedOut]);

  return {
    clearPopupWindowRef,
    popOut,
    popIn,
  };
};

/**
 * Manages the detached popup window lifecycle: opening, reclaiming orphaned
 * windows after refresh, cloning stylesheets, and reverting to inline mode
 * when the popup closes.
 *
 * @param params Configuration for the popup window.
 * @returns Popup state and actions for popping in/out.
 */
export const usePopupWindow = (params: UsePopupWindowParams) => {
  const { windowTitle, onPopIn } = params;
  const popupWindowRef = useRef<Window | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- popup window lifecycle is a detached DOM tree; TanStack Router state cannot reach across window boundaries
  const [popupRoot, setPopupRoot] = useState<HTMLElement | null>(null);
  // eslint-disable-next-line no-restricted-syntax -- popup window lifecycle is a detached DOM tree; TanStack Router state cannot reach across window boundaries
  const [isPoppedOut, setIsPoppedOut] = useState(false);

  // eslint-disable-next-line no-restricted-syntax -- stable identity required so the orphan-reclaim effect's dependency array remains stable across renders
  const setupPopupWindow = useCallback(
    (popupWindow: Window, shouldFocus = true) => {
      popupWindowRef.current = popupWindow;
      cloneHeadStyles(document, popupWindow.document);
      cloneThemeClasses(document, popupWindow.document);
      popupWindow.document.title = windowTitle;
      if (shouldFocus) {
        popupWindow.focus();
      }

      return createPopupRoot(popupWindow);
    },
    [windowTitle],
  );

  // eslint-disable-next-line no-restricted-syntax -- stable identity required so popup lifecycle helpers can clear the detached window ref without effect churn
  const clearPopupWindowRef = useCallback(() => {
    popupWindowRef.current = null;
  }, []);

  const { popOut, popIn } = usePopupWindowActions({
    clearPopupWindowRef,
    onPopIn,
    popupWindowRef,
    setIsPoppedOut,
    setPopupRoot,
    setupPopupWindow,
  });

  usePopupBeforeUnloadEffect({
    clearPopupWindowRef,
    isPoppedOut,
    onPopIn,
    popupWindowRef,
    setIsPoppedOut,
    setPopupRoot,
  });

  useReclaimPopupWindowEffect({
    popupWindowRef,
    setIsPoppedOut,
    setPopupRoot,
    setupPopupWindow,
  });

  return {
    popupRoot,
    isPoppedOut,
    popOut,
    popIn,
  };
};
