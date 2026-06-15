import { Button } from '@/features/ui/button/Button';
import { cn } from '@/features/ui/style/cn';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type ArgumentClassificationReviewActionsProps = {
  referenceId: string;
  className?: string;
  disabled?: boolean;
  onAccept: () => void;
  onReject: () => void;
};

export const ArgumentClassificationReviewActions = (
  props: ArgumentClassificationReviewActionsProps,
) => {
  const {
    referenceId,
    className,
    disabled = false,
    onAccept,
    onReject,
  } = props;
  const { t } = useTranslation('Ewms');

  return (
    <div
      className={cn(
        'inline-flex h-6 shrink-0 items-center overflow-hidden rounded-[4px] bg-purple-50 text-purple-700 shadow-[0px_0px_0px_1px_rgba(168,85,247,0.28)]',
        className,
      )}
    >
      <Button
        type="button"
        variant="ghost-light"
        size="xs"
        iconOnly
        className="rounded-none text-purple-700 hover:bg-purple-100 hover:text-purple-900"
        aria-label={t('arguments.rejectClassificationLabel', { referenceId })}
        disabled={disabled}
        onClick={onReject}
      >
        <X className="size-3.5" />
      </Button>
      <span className="h-3 w-px shrink-0 bg-purple-200" aria-hidden="true" />
      <Button
        type="button"
        variant="ghost-light"
        size="xs"
        iconOnly
        className="rounded-none text-purple-700 hover:bg-purple-100 hover:text-purple-900"
        aria-label={t('arguments.acceptClassificationLabel', { referenceId })}
        disabled={disabled}
        onClick={onAccept}
      >
        <Check className="size-3.5" />
      </Button>
    </div>
  );
};
