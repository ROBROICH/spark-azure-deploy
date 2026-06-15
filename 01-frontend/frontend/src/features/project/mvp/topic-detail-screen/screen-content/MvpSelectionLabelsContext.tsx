import { createContext, type ReactNode, useContext, useMemo } from 'react';

type MvpSelectionLabelsContextValue = {
  selectedDocumentLabel?: string | null;
  selectedNormLabel?: string | null;
};

const MvpSelectionLabelsContext =
  createContext<MvpSelectionLabelsContextValue | null>(null);

type MvpSelectionLabelsProviderProps = MvpSelectionLabelsContextValue & {
  children: ReactNode;
};

export const MvpSelectionLabelsProvider = (
  props: MvpSelectionLabelsProviderProps,
) => {
  const { children, selectedDocumentLabel, selectedNormLabel } = props;
  const parentValue = useContext(MvpSelectionLabelsContext);
  const value = useMemo(
    () => ({
      ...(parentValue ?? {}),
      selectedDocumentLabel,
      selectedNormLabel,
    }),
    [parentValue, selectedDocumentLabel, selectedNormLabel],
  );

  return (
    <MvpSelectionLabelsContext.Provider value={value}>
      {children}
    </MvpSelectionLabelsContext.Provider>
  );
};

const useMvpSelectionLabelsContext = () => {
  const context = useContext(MvpSelectionLabelsContext);

  if (context === null) {
    throw new Error(
      'useMvpSelectionLabelsContext must be used within MvpSelectionLabelsProvider',
    );
  }

  return context;
};

export const useSelectedDocumentLabel = () => {
  return useMvpSelectionLabelsContext().selectedDocumentLabel ?? null;
};

export const useSelectedNormLabel = () => {
  return useMvpSelectionLabelsContext().selectedNormLabel ?? null;
};
