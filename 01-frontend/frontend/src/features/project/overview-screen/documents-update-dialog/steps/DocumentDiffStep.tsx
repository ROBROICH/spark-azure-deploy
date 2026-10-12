import { Button } from '@/features/ui/button/Button';
import { Loader2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DialogShell } from '../dialog-content/DialogShell';
import { DiffPanel } from '../dialog-content/DiffPanel';
import { useConfirmDiffApproval } from '../dialog-logic/useConfirmDiffApproval';
import { useDiffSelection } from '../dialog-logic/useDiffSelection';
import { useMirroredScroll } from '../dialog-logic/useMirroredScroll';
import { useRejectDiffApproval } from '../dialog-logic/useRejectDiffApproval';
import { useZipFileDiff } from '../dialog-logic/useZipFileDiff';
import { useDocumentsUploadContext } from '../DocumentsUploadContext';

type PendingDiffAction = 'confirm' | 'reject' | null;

/**
 * Renders the diff view between the previous and uploaded document set, owns
 * per-row selection state, and triggers the approve flow that promotes the
 * uploaded ZIP into a new project version.
 *
 * @returns The dialog step that confirms the uploaded ZIP into a new version.
 */
export const DocumentDiffStep = () => {
  const { t } = useTranslation('Project');
  const { zipFileId, projectId, dismiss, goToAiProcesses, approvalActions } =
    useDocumentsUploadContext();
  const { diff, isLoading, isError, refetch } = useZipFileDiff(zipFileId);
  const { confirm, isSubmitting, approveError } =
    useConfirmDiffApproval(approvalActions);
  const { reject, isRejecting } = useRejectDiffApproval(approvalActions);
  // eslint-disable-next-line no-restricted-syntax -- footer action state controls which button may show loading feedback.
  const [pendingAction, setPendingAction] = useState<PendingDiffAction>(null);

  const {
    tree,
    selectedKeys,
    expandedPaths,
    selectableTotal,
    selectedCount,
    hasIncludedChanges,
    toggleKey,
    toggleAll,
    toggleFolder,
  } = useDiffSelection(diff ?? null);

  const oldScrollRef = useRef<HTMLDivElement | null>(null);
  const newScrollRef = useRef<HTMLDivElement | null>(null);

  useMirroredScroll({
    refA: oldScrollRef,
    refB: newScrollRef,
    resetSignal: diff,
  });

  const isActionPending = pendingAction !== null || isSubmitting || isRejecting;

  const handleConfirm = () => {
    setPendingAction('confirm');
    void confirm({
      zipFileId,
      projectId,
      diff,
      selectedKeys,
      onApproved: goToAiProcesses,
    }).finally(() => setPendingAction(null));
  };

  const handleReject = () => {
    setPendingAction('reject');
    void reject({
      zipFileId,
      projectId,
      onRejected: dismiss,
    }).finally(() => setPendingAction(null));
  };

  return (
    <DialogShell
      width="wide"
      height="fixed"
      lockClose
      title={t('Documents.updateDocuments.diff.title')}
      description={t('Documents.updateDocuments.diff.description')}
      footer={
        <div className="ml-auto flex items-center gap-2">
          {selectableTotal > 0 && (
            <span className="rounded-lg bg-white px-3 py-2 text-[11px] leading-[14px] font-medium tracking-[0.02em] text-blue-900">
              {t('Documents.updateDocuments.diff.selectedCount', {
                count: selectedCount,
                total: selectableTotal,
              })}
            </span>
          )}
          <Button
            variant="secondary"
            size="default"
            onClick={handleReject}
            disabled={isLoading || isActionPending || !zipFileId}
          >
            {t('Documents.updateDocuments.diff.reject')}
          </Button>
          <Button
            variant="primary"
            size="default"
            onClick={handleConfirm}
            loading={pendingAction === 'confirm'}
            disabled={
              isLoading ||
              isError ||
              !hasIncludedChanges ||
              isActionPending ||
              !zipFileId
            }
          >
            {t('Documents.updateDocuments.diff.confirmAndContinue')}
          </Button>
        </div>
      }
    >
      {isLoading && (
        <div
          role="status"
          aria-live="polite"
          aria-label={t('Documents.updateDocuments.diff.loading')}
          className="flex flex-1 items-center justify-center py-10"
        >
          <Loader2
            className="size-8 animate-spin text-brand-navy"
            aria-hidden
          />
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="m-4 flex items-center gap-3 text-[13px] leading-[18px] text-red-700"
        >
          <span>{t('Documents.updateDocuments.diff.loadError')}</span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void refetch();
            }}
          >
            {t('Documents.updateDocuments.diff.retry')}
          </Button>
        </div>
      )}

      {approveError && (
        <p role="alert" className="m-4 text-[13px] leading-[18px] text-red-700">
          {t('Documents.updateDocuments.diff.approveError')}
        </p>
      )}

      {diff && !isLoading && (
        <div className="flex flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 border-r border-slate-200">
            <DiffPanel
              variant="old"
              tree={tree}
              expandedPaths={expandedPaths}
              onToggleFolder={toggleFolder}
              scrollRef={oldScrollRef}
            />
          </div>
          <div className="flex min-w-0 flex-1">
            <DiffPanel
              variant="new"
              tree={tree}
              selectedKeys={selectedKeys}
              expandedPaths={expandedPaths}
              onToggleFolder={toggleFolder}
              scrollRef={newScrollRef}
              selectableTotal={selectableTotal}
              selectedTotal={selectedCount}
              onToggleKey={toggleKey}
              onToggleAll={toggleAll}
            />
          </div>
        </div>
      )}
    </DialogShell>
  );
};
