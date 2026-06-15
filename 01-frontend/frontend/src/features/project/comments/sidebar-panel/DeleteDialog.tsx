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

import { removeComment } from '@/features/project/comments/data/actions/commentActions';
import { useComments } from '@/features/project/comments/data/read-model/useComments';

// Use the layout route (shared across steps)
const route = getRouteApi('/verfahren/$verfahrenId');

type DeleteDialogProps = {
  canMutateProject: boolean;
};

export const DeleteDialog = (props: DeleteDialogProps) => {
  const { canMutateProject } = props;
  const navigate = useNavigate();
  const { t } = useTranslation('Project');
  const { verfahrenId } = route.useParams();
  const { deleteCommentId } = route.useSearch();
  const { comments } = useComments(verfahrenId);
  const descriptionId = useId();

  const itemToDelete = comments.find((item) => item.id === deleteCommentId);

  const isOpen = !!deleteCommentId && !!itemToDelete;

  const handleClose = () => {
    navigate({
      to: '.',
      search: (prev) => ({
        ...prev,
        deleteCommentId: undefined,
      }),
      replace: true,
      resetScroll: false,
    });
  };

  const handleDelete = async () => {
    if (!canMutateProject || !deleteCommentId) {
      return;
    }

    try {
      await removeComment(deleteCommentId);
    } catch (error) {
      // Keep the dialog open so the user can retry the deletion.
      Sentry.captureException(error);
      toast.error(t('Sidebar.commentDeleteDialog.error'));
      return;
    }

    handleClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent showCloseButton aria-describedby={descriptionId}>
        <DialogHeader>
          <DialogTitle>{t('Sidebar.commentDeleteDialog.title')}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <DialogDescription id={descriptionId} className="mb-4">
            {t('Sidebar.commentDeleteDialog.description')}
          </DialogDescription>
          <p className="text-[13px] font-medium">{itemToDelete?.title}</p>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
            {t('Sidebar.commentDeleteDialog.cancel')}
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={!canMutateProject}
            onClick={handleDelete}
          >
            {t('Sidebar.commentDeleteDialog.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
