import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Button } from '@/features/ui/button/Button';
import { SplitButton } from '@/features/ui/button/SplitButton';
import { EllipsisVertical, FileInput, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type AiSatzRowActionsProps = {
  addCommentLabel: string;
  isChecked: boolean;
  isDisabled: boolean;
  needsRevision: boolean;
  moreOptionsLabel: string;
  onAddComment: () => void;
  onCheckedChange: () => void;
  onRequestMore: () => void;
  requestMoreLabel: string;
};

export function AiSatzRowActions(props: AiSatzRowActionsProps) {
  const { t } = useTranslation('Rpb');
  const {
    addCommentLabel,
    isChecked,
    isDisabled,
    needsRevision,
    moreOptionsLabel,
    onAddComment,
    onCheckedChange,
    onRequestMore,
    requestMoreLabel,
  } = props;
  const uncheckedLabel = needsRevision
    ? t('aiAssistance.sentenceNeedsRevision')
    : undefined;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="size-6" />
      <ActionMenu>
        <ActionMenuTrigger asChild>
          <Button iconOnly aria-label={moreOptionsLabel} variant="ghost">
            <EllipsisVertical className="text-slate-600" aria-hidden="true" />
          </Button>
        </ActionMenuTrigger>
        <ActionMenuContent align="end">
          <ActionMenuItem disabled={isDisabled} onClick={onRequestMore}>
            <FileInput aria-hidden="true" /> {requestMoreLabel}
          </ActionMenuItem>
          <ActionMenuItem disabled={isDisabled} onClick={onAddComment}>
            <MessageSquare aria-hidden="true" /> {addCommentLabel}
          </ActionMenuItem>
        </ActionMenuContent>
      </ActionMenu>
      <SplitButton
        size="sm"
        checked={isChecked}
        disabled={isDisabled}
        onCheckedChange={onCheckedChange}
        uncheckedLabel={uncheckedLabel}
      />
    </div>
  );
}
