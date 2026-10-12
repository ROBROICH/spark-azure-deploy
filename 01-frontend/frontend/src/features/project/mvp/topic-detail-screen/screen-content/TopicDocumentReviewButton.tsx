import {
  ActionMenu,
  ActionMenuCheckboxItem,
  ActionMenuContent,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Button } from '@/features/ui/button/Button';
import { SplitButton } from '@/features/ui/button/SplitButton';
import { useBelowLg } from '@/features/ui/responsive/useMobile';
import { cn } from '@/features/ui/style/cn';
import { Check, MoreVertical } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type TopicDocumentReviewButtonProps = {
  checked: boolean;
  className?: string;
  disabled?: boolean;
  fileName: string;
  onCheckedChange: (checked: boolean) => void;
};

/**
 * Per-document review toggle. Renders the labelled `SplitButton` at `lg`+
 * and collapses to a three-dot ActionMenu below `lg` where the Unterlagen
 * swimlane gets crowded at 200% zoom. A green Check next to the compact
 * trigger shows the reviewed state without opening the menu. When disabled,
 * we render a bare icon button so the menu can never open read-only.
 */
export const TopicDocumentReviewButton = (
  props: TopicDocumentReviewButtonProps,
) => {
  const { checked, className, disabled, fileName, onCheckedChange } = props;
  const { t } = useTranslation('MvpRedesign');
  const isCompact = useBelowLg();

  if (!isCompact) {
    return (
      <SplitButton
        checked={checked}
        disabled={disabled}
        onCheckedChange={onCheckedChange}
        uncheckedLabel={t('DocumentItem.sichten')}
        checkedLabel={t('DocumentItem.gesichtet')}
        className={className}
      />
    );
  }

  const menuAriaLabel = t('DocumentItem.actionsMenuAriaLabel', {
    file: fileName,
  });
  const actionCopy = checked
    ? t('DocumentItem.sichtenEntfernen')
    : t('DocumentItem.sichten');
  const triggerAriaLabel = `${menuAriaLabel} \u2014 ${actionCopy}`;

  const checkedIndicator = checked ? (
    <Check
      className="size-4 shrink-0 text-green-900"
      data-testid="document-reviewed-indicator"
      aria-hidden="true"
    />
  ) : null;

  const triggerButton = (
    <Button
      variant="ghost-light"
      size="xs"
      iconOnly
      disabled={disabled}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      aria-label={triggerAriaLabel}
      title={actionCopy}
    >
      <MoreVertical aria-hidden="true" />
    </Button>
  );

  if (disabled) {
    return (
      <div className={cn('flex items-center gap-2', className)}>
        {checkedIndicator}
        {triggerButton}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {checkedIndicator}
      <ActionMenu>
        <ActionMenuTrigger asChild>{triggerButton}</ActionMenuTrigger>
        <ActionMenuContent align="end">
          <ActionMenuCheckboxItem
            checked={checked}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={onCheckedChange}
          >
            {actionCopy}
          </ActionMenuCheckboxItem>
        </ActionMenuContent>
      </ActionMenu>
    </div>
  );
};
