import { commentSidebarSearchUpdate } from '@/features/project/action-sidebar/commentSidebarNav';
import {
  confirmDocumentType,
  setDocumentType,
} from '@/features/project/fvp/main-screen/data/actions/documentActions';
import { notifyOnPersistenceFailure } from '@/features/project/fvp/main-screen/read-status/notifyOnPersistenceFailure';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/documents/');

type RequestDocumentSource = 'tableOfContents' | 'requiredDocuments';

type UseDocumentsTableActionsParams = {
  canMutateProject: boolean;
  verfahrenId: string;
};

type DocumentsNavigate = ReturnType<typeof route.useNavigate>;

const usePreviewActions = (navigate: DocumentsNavigate) => {
  // eslint-disable-next-line no-restricted-syntax -- stable callback identity prevents unnecessary table column churn in this compiler-opt-out table
  const handleFileClick = useCallback(
    (documentId: string) => {
      navigate({
        search: (prev) => ({
          ...prev,
          previewDocumentId: documentId,
        }),
        resetScroll: false,
      });
    },
    [navigate],
  );

  return {
    handleFileClick,
  };
};

type UseRequestActionsParams = {
  canMutateProject: boolean;
  navigate: DocumentsNavigate;
};

/**
 * Builds request-list and comment-sidebar actions for table rows.
 *
 * @param params Permission and route navigation dependencies.
 * @returns Stable callbacks for requesting a document and opening the comment sidebar.
 */
const useRequestActions = (params: UseRequestActionsParams) => {
  const { canMutateProject, navigate } = params;

  // eslint-disable-next-line no-restricted-syntax -- stable callback identity prevents unnecessary table column churn in this compiler-opt-out table
  const handleRequestDocument = useCallback(
    (title: string, documentId: string, source?: RequestDocumentSource) => {
      if (!canMutateProject) {
        return;
      }

      navigate({
        search: (prev) => ({
          ...prev,
          sidebarPanel: 'requestList',
          newRequestListInitItems: [
            {
              title,
              sourceRef: {
                type: source ?? 'requiredDocuments',
                itemId: documentId,
              },
            },
          ],
        }),
        replace: true,
        resetScroll: false,
      });
    },
    [canMutateProject, navigate],
  );

  // eslint-disable-next-line no-restricted-syntax -- stable callback identity prevents unnecessary table column churn in this compiler-opt-out table
  const handleAddComment = useCallback(
    (title: string) => {
      if (!canMutateProject) {
        return;
      }

      navigate({
        search: (prev) => ({
          ...prev,
          ...commentSidebarSearchUpdate(title),
        }),
        replace: true,
        resetScroll: false,
      });
    },
    [canMutateProject, navigate],
  );

  return {
    handleAddComment,
    handleRequestDocument,
  };
};

type UseManagementActionsParams = {
  canMutateProject: boolean;
  navigate: DocumentsNavigate;
};

/**
 * Builds document management actions that open route-owned dialogs.
 *
 * @param params Permission and route navigation dependencies.
 * @returns Stable callback for the custom document-type management flow.
 */
const useManagementActions = (params: UseManagementActionsParams) => {
  const { canMutateProject, navigate } = params;

  // eslint-disable-next-line no-restricted-syntax -- stable callback identity prevents unnecessary table column churn in this compiler-opt-out table
  const handleManageCustomDocumentTypes = useCallback(() => {
    if (!canMutateProject) {
      return;
    }

    navigate({
      search: (prev) => ({
        ...prev,
        isEditRequiredDocumentsDialogOpen: true,
      }),
      replace: true,
      resetScroll: false,
    });
  }, [canMutateProject, navigate]);

  return {
    handleManageCustomDocumentTypes,
  };
};

type UseDocumentTypeActionsParams = {
  canMutateProject: boolean;
  verfahrenId: string;
};

const useDocumentTypeActions = (params: UseDocumentTypeActionsParams) => {
  const { canMutateProject, verfahrenId } = params;
  const { t } = useTranslation('FormalCompletenessCheck');

  // eslint-disable-next-line no-restricted-syntax -- stable callback identity prevents unnecessary table column churn in this compiler-opt-out table
  const handleConfirmDocumentType = useCallback(
    (documentId: string) => {
      if (!canMutateProject) {
        return;
      }

      notifyOnPersistenceFailure(
        confirmDocumentType(verfahrenId, documentId),
        t('common.errors.actionFailed'),
      );
    },
    [canMutateProject, t, verfahrenId],
  );

  // eslint-disable-next-line no-restricted-syntax -- stable callback identity prevents unnecessary table column churn in this compiler-opt-out table
  const handleSelectDocumentType = useCallback(
    (documentId: string, documentType: string) => {
      if (!canMutateProject) {
        return;
      }

      notifyOnPersistenceFailure(
        setDocumentType(verfahrenId, documentId, documentType),
        t('common.errors.actionFailed'),
      );
    },
    [canMutateProject, t, verfahrenId],
  );

  return {
    handleConfirmDocumentType,
    handleSelectDocumentType,
  };
};

export const useDocumentsTableActions = (
  params: UseDocumentsTableActionsParams,
) => {
  const { canMutateProject, verfahrenId } = params;
  const navigate = route.useNavigate();
  const previewActions = usePreviewActions(navigate);
  const requestActions = useRequestActions({
    canMutateProject,
    navigate,
  });
  const managementActions = useManagementActions({
    canMutateProject,
    navigate,
  });
  const documentTypeActions = useDocumentTypeActions({
    canMutateProject,
    verfahrenId,
  });

  return {
    ...documentTypeActions,
    ...managementActions,
    ...previewActions,
    ...requestActions,
  };
};
