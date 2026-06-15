import { useStartFvpWorkflow } from '@/features/workflow-runtime/workflow-status/useStartFvpWorkflow';
import { isHandledProjectVersionConflictError } from '@/integrations/api-clients/projectVersionConflictHandledError';
import { Button } from '@/features/ui/button/Button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/features/ui/dialog/Dialog';
import { experimentalRouteRemount } from '@/integrations/router/routeRemount';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

type StartFvpRunDialogProps = {
  canMutateProject?: boolean;
  canStartProcess: boolean;
  onClose: () => Promise<void> | void;
  open: boolean;
  verfahrenId: string;
};

/** Renders the route-backed confirmation dialog for starting the FVP AI workflow. */
export const StartFvpRunDialog = (props: StartFvpRunDialogProps) => {
  const {
    canMutateProject = true,
    canStartProcess,
    onClose,
    open,
    verfahrenId,
  } = props;
  const { t } = useTranslation('FormalCompletenessCheck');
  // eslint-disable-next-line no-restricted-syntax -- dialog-local error visibility is ephemeral UI state that should not be stored in the URL.
  const [showStartError, setShowStartError] = useState(false);
  const { startFvpWorkflow, isStartingFvpWorkflow } =
    useStartFvpWorkflow(verfahrenId);

  const close = async () => {
    setShowStartError(false);
    await onClose();
  };

  const confirm = async () => {
    if (!canMutateProject || !canStartProcess) {
      return;
    }

    setShowStartError(false);

    try {
      await startFvpWorkflow();
      await close();
      await experimentalRouteRemount(verfahrenId);
    } catch (error) {
      if (isHandledProjectVersionConflictError(error)) {
        return;
      }
      setShowStartError(true);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          close();
        }
      }}
    >
      <DialogContent className="sm:max-w-[392px]">
        <DialogHeader>
          <DialogTitle>{t('redesign.startDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="whitespace-pre-line">
          <DialogDescription className="text-sm leading-[18px] text-text-secondary">
            {t('redesign.startDialog.description')}
          </DialogDescription>
          {showStartError && (
            <p
              role="alert"
              className="mt-4 rounded-md border border-border-error bg-highlight-error px-3 py-2 text-sm leading-[18px] text-text-error"
            >
              {t('redesign.startDialog.error')}
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={close}
            disabled={isStartingFvpWorkflow}
          >
            {t('redesign.startDialog.cancel')}
          </Button>
          <Button
            type="button"
            size="sm"
            withIcon
            onClick={confirm}
            loading={isStartingFvpWorkflow}
            disabled={!canMutateProject || !canStartProcess}
          >
            <Play aria-hidden="true" />
            {t('redesign.startDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
