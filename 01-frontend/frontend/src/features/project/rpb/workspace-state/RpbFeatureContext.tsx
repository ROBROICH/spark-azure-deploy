import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

const BESCHLUSS_COMMIT_RELEASE_DELAY_MS = 1_000;

type RpbFeatureState = {
  isBeschlussCommitPending: boolean;
  trackBeschlussCommit: (promise: Promise<unknown>) => void;
};

const RpbFeatureContext = createContext<RpbFeatureState | null>(null);

type RpbFeatureProviderProps = {
  children: ReactNode;
};

export const RpbFeatureProvider = (props: RpbFeatureProviderProps) => {
  const { children } = props;
  const releaseTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(
    new Set(),
  );
  const [pendingBeschlussCommitCount, setPendingBeschlussCommitCount] =
    // eslint-disable-next-line no-restricted-syntax -- pending Beschluss commits are transient runtime save state, not shareable route state.
    useState(0);

  const trackBeschlussCommit = useCallback((promise: Promise<unknown>) => {
    setPendingBeschlussCommitCount((count) => count + 1);
    const clearPendingCommit = () => {
      const timeout = setTimeout(() => {
        releaseTimeoutsRef.current.delete(timeout);
        setPendingBeschlussCommitCount((count) => Math.max(0, count - 1));
      }, BESCHLUSS_COMMIT_RELEASE_DELAY_MS);

      releaseTimeoutsRef.current.add(timeout);
    };

    void promise.then(clearPendingCommit, clearPendingCommit);
  }, []);

  // eslint-disable-next-line no-restricted-syntax -- timer cleanup prevents delayed commit release callbacks from surviving the RPB page.
  useEffect(
    () => () => {
      for (const timeout of releaseTimeoutsRef.current) {
        clearTimeout(timeout);
      }
      releaseTimeoutsRef.current.clear();
    },
    [],
  );

  const value = useMemo(
    () => ({
      isBeschlussCommitPending: pendingBeschlussCommitCount > 0,
      trackBeschlussCommit,
    }),
    [pendingBeschlussCommitCount, trackBeschlussCommit],
  );

  return (
    <RpbFeatureContext.Provider value={value}>
      {children}
    </RpbFeatureContext.Provider>
  );
};

export const useRpbFeatureContext = () => {
  const context = useContext(RpbFeatureContext);

  if (!context) {
    throw new Error(
      'useRpbFeatureContext must be used within RpbFeatureProvider',
    );
  }

  return context;
};
