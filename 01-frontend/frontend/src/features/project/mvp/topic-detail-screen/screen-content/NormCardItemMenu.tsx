import {
  ActionMenu,
  ActionMenuContent,
  ActionMenuItem,
  ActionMenuTrigger,
} from '@/features/ui/action-menu/ActionMenu';
import { Button } from '@/features/ui/button/Button';
import {
  MoreVertical,
  FileInput,
  MessageSquare,
  LayoutList,
  Trash2,
} from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';

type NormCardItemMenuProps = {
  canMutateTopic: boolean;
  isRemoving: boolean;
  onAddComment: () => void;
  onRemove: () => void;
  onRequestMore: () => void;
  onShowNormText: () => void;
};

export const NormCardItemMenu = (props: NormCardItemMenuProps) => {
  const {
    canMutateTopic,
    isRemoving,
    onAddComment,
    onRemove,
    onRequestMore,
    onShowNormText,
  } = props;
  const { t } = useTranslation('MvpRedesign');
  // Tracks whether the selected action opens a sidebar panel. When it does,
  // we suppress Radix's auto-focus back to the trigger to avoid focus fighting
  // with the opening panel. Escape / click-away don't set this flag, so focus
  // returns to the trigger normally in those cases.
  const opensPanelRef = useRef(false);

  return (
    <ActionMenu>
      <ActionMenuTrigger asChild>
        <Button
          variant="ghost-light"
          iconOnly
          size="xs"
          aria-label={t('NormCardItem.moreActions')}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onKeyDown={(event) => {
            event.stopPropagation();
          }}
        >
          <MoreVertical className="size-4" aria-hidden="true" />
        </Button>
      </ActionMenuTrigger>
      <ActionMenuContent
        align="end"
        onCloseAutoFocus={(e) => {
          if (opensPanelRef.current) {
            e.preventDefault();
            opensPanelRef.current = false;
          }
        }}
        onClick={(event) => {
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
        }}
      >
        <ActionMenuItem
          disabled={!canMutateTopic}
          onClick={() => {
            opensPanelRef.current = true;
            onRequestMore();
          }}
        >
          <FileInput />
          {t('NormCardItem.nachfordern')}
        </ActionMenuItem>
        <ActionMenuItem
          disabled={!canMutateTopic}
          onClick={() => {
            opensPanelRef.current = true;
            onAddComment();
          }}
        >
          <MessageSquare />
          {t('NormCardItem.addComment')}
        </ActionMenuItem>
        <ActionMenuItem onClick={onShowNormText}>
          <LayoutList />
          {t('NormCardItem.normTextAnzeigen')}
        </ActionMenuItem>
        <ActionMenuItem
          variant="destructive"
          disabled={!canMutateTopic || isRemoving}
          onClick={onRemove}
        >
          <Trash2 />
          {t('NormCardItem.normEntfernen')}
        </ActionMenuItem>
      </ActionMenuContent>
    </ActionMenu>
  );
};
