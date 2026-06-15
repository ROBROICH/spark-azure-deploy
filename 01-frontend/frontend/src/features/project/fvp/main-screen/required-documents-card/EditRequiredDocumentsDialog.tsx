import { Button } from '@/features/ui/button/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { toast } from '@/features/ui/toast/Toast';
import { getRouteApi } from '@tanstack/react-router';
import { useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useCanMutateProject } from '@/features/access-control/project-permissions/useCanMutateProject';
import { setRequiredDocumentsStructure } from '../data/actions/requiredDocumentActions';
import { useRequiredDocumentsTree } from '../data/read-model/useRequiredDocuments';
import { EditRequiredDocumentsConfirmDialog } from './EditRequiredDocumentsConfirmDialog';
import { RequiredDocumentsAddRow } from './RequiredDocumentsAddRow';
import { RequiredDocumentsEditorNode } from './RequiredDocumentsEditorNode';
import {
  RequiredDocumentsEditorProvider,
  useRequiredDocumentsEditorContext,
} from './RequiredDocumentsEditorContext';

const route = getRouteApi('/verfahren/$verfahrenId/fvp/documents/');

type EditRequiredDocumentsDialogContentProps = {
  verfahrenId: string;
  onClose: () => void;
};

/**
 * Renders the editor body and save flow. Reads draft/editing state from
 * `RequiredDocumentsEditorContext`; the save flow awaits persistence and keeps
 * the dialog open with the unsaved draft on failure.
 */
const EditRequiredDocumentsDialogContent = (
  props: EditRequiredDocumentsDialogContentProps,
) => {
  const { verfahrenId, onClose } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  const editor = useRequiredDocumentsEditorContext();
  const {
    localStructure,
    scrollContainerRef,
    addDocumentAnchorRef,
    isAddingNew,
    newDocName,
    newInputRef,
    setNewDocName,
    confirmAddNew,
    cancelAddNew,
    startAddingNew,
    hasDuplicateNewDocumentTypeError,
    isDuplicateNewDocumentName,
    isDuplicateEditingDocumentType,
  } = editor;

  // eslint-disable-next-line no-restricted-syntax -- confirmation dialog visibility is transient modal UI state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const handleConfirmSave = async () => {
    const transactions = setRequiredDocumentsStructure(
      verfahrenId,
      localStructure,
    );
    setShowConfirmDialog(false);

    try {
      await Promise.all(
        transactions.map((transaction) => transaction.isPersisted.promise),
      );
      onClose();
    } catch {
      // Keep the dialog open with the unsaved draft so the user can retry; the
      // optimistic collection changes have already rolled back.
      toast.error(t('common.errors.actionFailed'));
    }
  };

  return (
    <>
      <Dialog
        open
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            onClose();
          }
        }}
      >
        <DialogContent
          aria-describedby="edit-required-documents-description"
          className="sm:max-w-4xl"
        >
          <DialogHeader>
            <DialogTitle>{t('EditRequiredDocumentsDialog.title')}</DialogTitle>
          </DialogHeader>

          <DialogBody
            ref={scrollContainerRef}
            className="max-h-[calc(80vh-106px)] overflow-y-auto p-4"
          >
            <p
              id="edit-required-documents-description"
              className="mb-4 text-[13px] leading-[18px] text-neutral-600"
            >
              <Trans
                t={t}
                ns="FormalCompletenessCheck"
                i18nKey="EditRequiredDocumentsDialog.description"
                components={{
                  strong: <strong className="font-medium text-brand-950" />,
                  br: <br />,
                }}
              />
            </p>

            <div className="flex flex-col gap-2">
              {localStructure.map((node) => (
                <RequiredDocumentsEditorNode key={node.id} node={node} />
              ))}

              <RequiredDocumentsAddRow
                isAddingNew={isAddingNew}
                newDocName={newDocName}
                hasDuplicateDocumentType={hasDuplicateNewDocumentTypeError}
                newInputRef={newInputRef}
                anchorRef={addDocumentAnchorRef}
                onNewDocNameChange={setNewDocName}
                onConfirmAddNew={confirmAddNew}
                onCancelAddNew={cancelAddNew}
                onStartAddingNew={startAddingNew}
              />
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose}>
              {t('EditRequiredDocumentsDialog.cancel')}
            </Button>
            <Button
              type="button"
              onClick={() => setShowConfirmDialog(true)}
              disabled={
                isDuplicateNewDocumentName || isDuplicateEditingDocumentType
              }
            >
              {t('EditRequiredDocumentsDialog.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditRequiredDocumentsConfirmDialog
        open={showConfirmDialog}
        onOpenChange={() => setShowConfirmDialog(false)}
        onCancel={() => setShowConfirmDialog(false)}
        onConfirm={() => void handleConfirmSave()}
      />
    </>
  );
};

/**
 * Modal dialog for editing the required documents structure. Owns the route
 * close handler and provides the editor context for the recursive editor tree.
 */
export const EditRequiredDocumentsDialog = () => {
  const { verfahrenId } = route.useParams();
  const navigate = route.useNavigate();
  const { canMutateProject } = useCanMutateProject({
    requiredLevel: 'user',
  });
  const { tree: requiredDocumentsStructure } =
    useRequiredDocumentsTree(verfahrenId);

  const closeDialog = () => {
    navigate({
      search: (prev) => ({
        ...prev,
        isEditRequiredDocumentsDialogOpen: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  if (!canMutateProject) {
    return null;
  }

  return (
    <RequiredDocumentsEditorProvider
      requiredDocumentsStructure={requiredDocumentsStructure}
    >
      <EditRequiredDocumentsDialogContent
        verfahrenId={verfahrenId}
        onClose={closeDialog}
      />
    </RequiredDocumentsEditorProvider>
  );
};
