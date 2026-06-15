import { createContext, useContext, type ReactNode } from 'react';
import { useDocumentsUploadContextLogic } from './useDocumentsUploadContextLogic';

export type {
  UploadErrorDetails,
  UploadFile,
  UploadFileError,
  UploadFileStatus,
  UploadGlobalError,
  UploadPhase,
} from './DocumentsUploadContext.types';

type DocumentsUploadContextValue = ReturnType<
  typeof useDocumentsUploadContextLogic
>;

const DocumentsUploadContext =
  createContext<DocumentsUploadContextValue | null>(null);

export const useDocumentsUploadContext = () => {
  const context = useContext(DocumentsUploadContext);
  if (!context) {
    throw new Error(
      'useDocumentsUploadContext must be used within an DocumentsUploadProvider',
    );
  }
  return context;
};

type DocumentsUploadProviderProps = {
  children: ReactNode;
};

export const DocumentsUploadProvider = (
  props: DocumentsUploadProviderProps,
) => {
  const value = useDocumentsUploadContextLogic();
  return (
    <DocumentsUploadContext.Provider value={value}>
      {props.children}
    </DocumentsUploadContext.Provider>
  );
};
