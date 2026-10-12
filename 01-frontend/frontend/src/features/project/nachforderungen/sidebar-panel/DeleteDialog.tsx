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
import { toast } from '@/features/ui/toast/Toast';
import * as Sentry from '@sentry/react';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { removeRequestItem } from '@/features/project/nachforderungen/data/actions/requestItemActions';
import type { RequestItem } from '@/features/project/nachforderungen/data/schemas/requestItem.schema';

// Use the layout route (shared across FVP and PP)
const route = getRouteApi('/verfahren/$verfahrenId');

type DeleteDialogProps = {
  canMutateProject: boolean;
  items: ReadonlyArray<RequestItem>;
};

export const DeleteDialog = (props: DeleteDialogProps) => {
  const { canMutateProject, items } = props;
  const { t } = useTranslation('SupplementaryRequests');
  const navigate = useNavigate();
  const descriptionId = useId();
  const { verfahrenId } = route.useParams();
  const { deleteRequestItemId } = route.useSearch();
  const itemToDelete = items.find((item) => item.id === deleteRequestItemId);

  const isOpen = !!deleteRequestItemId;

  const handleClose = () => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        deleteRequestItemId: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const handleDelete = async () => {
    if (!canMutateProject || !deleteRequestItemId) {
      return;
    }

    try {
      await removeRequestItem(verfahrenId, deleteRequestItemId);
    } catch (error) {
      // Keep the dialog open so the user can retry the deletion.
      Sentry.captureException(error);
      toast.error(t('RequestListPanel.deleteDialog.error'));
      return;
    }

    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent showCloseButton aria-describedby={descriptionId}>
        <DialogHeader>
          <DialogTitle>{t('RequestListPanel.deleteDialog.title')}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <DialogDescription id={descriptionId} className="mb-4">
            {t('RequestListPanel.deleteDialog.description')}
          </DialogDescription>
          <p className="text-[13px] font-medium">{itemToDelete?.title}</p>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
            {t('RequestListPanel.deleteDialog.cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={!canMutateProject}
            onClick={handleDelete}
          >
            {t('RequestListPanel.deleteDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
