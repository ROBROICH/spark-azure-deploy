import { Button } from '@/features/ui/button/Button';
import { DialogClose, DialogFooter } from '@/features/ui/dialog/Dialog';
import { useTranslation } from 'react-i18next';

export function FeedbackFormFooter(props: {
  disabled: boolean;
  isDeleteConfirmationPending: boolean;
  isSaveLoading: boolean;
  namespace: string;
  onDelete?: () => void;
}) {
  const {
    disabled,
    isDeleteConfirmationPending,
    isSaveLoading,
    namespace,
    onDelete,
  } = props;
  const { t } = useTranslation(namespace);

  return (
    <DialogFooter>
      {onDelete ? (
        <Button
          type="button"
          variant="danger"
          size="sm"
          disabled={disabled}
          onClick={onDelete}
          className="min-w-[122px]"
        >
          {isDeleteConfirmationPending
            ? t('FeedbackDialog.confirmDelete')
            : t('FeedbackDialog.delete')}
        </Button>
      ) : (
        <span />
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <DialogClose asChild>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled}
          >
            {t('FeedbackDialog.cancel')}
          </Button>
        </DialogClose>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={disabled && !isSaveLoading}
          loading={isSaveLoading}
        >
          {t('FeedbackDialog.save')}
        </Button>
      </div>
    </DialogFooter>
  );
}
