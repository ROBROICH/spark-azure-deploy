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
import { eq, useLiveQuery } from '@tanstack/react-db';
import { getRouteApi, useNavigate } from '@tanstack/react-router';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import { removeRequestItem } from '@/features/project/nachforderungen/data/actions/requestItemActions';
import { requestItemsCollection } from '@/features/project/nachforderungen/data/collections/requestItems.collection';

// Use the layout route (shared across FVP and PP)
const route = getRouteApi('/verfahren/$verfahrenId');

type DeleteDialogProps = {
  canMutateProject: boolean;
};

export const DeleteDialog = (props: DeleteDialogProps) => {
  const { canMutateProject } = props;
  const { t } = useTranslation('SupplementaryRequests');
  const navigate = useNavigate();
  const descriptionId = useId();
  const { verfahrenId } = route.useParams();
  const { deleteRequestItemId } = route.useSearch();
  const { data: requestItemsData } = useLiveQuery((q) =>
    q
      .from({ items: requestItemsCollection })
      .where(({ items }) => eq(items.projectId, verfahrenId)),
  );
  const requestItems = [...requestItemsData].sort((a, b) => {
    const dateA = new Date(a.createdAt).getTime();
    const dateB = new Date(b.createdAt).getTime();
    return dateA - dateB;
  });

  // Find the item to delete
  const itemToDelete = requestItems.find(
    (item) => item.id === deleteRequestItemId,
  );

  const isOpen = !!deleteRequestItemId && !!itemToDelete;

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
      await removeRequestItem(deleteRequestItemId);
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
