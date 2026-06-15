import type { NodePayloadByType } from '@/db/nodes/types';
import { AiStatusChip } from '@/features/ui/ai/AiStatusChip';
import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { cn } from '@/features/ui/style/cn';
import { File } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFundstellenBadgePresenceForSelection } from './useFundstellenBadgePresence';
import { useSelectedNormLabel } from './MvpSelectionLabelsContext';
import { TopicDocumentReviewButton } from './TopicDocumentReviewButton';

type DocumentItemProps = {
  canMutateTopic: boolean;
  document: NodePayloadByType<'dokument'>;
  depth: number;
  isSelected: boolean;
  isReviewed: boolean;
  onSelectDocument: (documentId: string) => void;
  onToggleReviewed: (documentId: string) => void;
  selectedNormId?: string;
};

/**
 * Renders a document tree row whose active state, AI-support badge, and review
 * control must stay aligned with the currently selected document or norm.
 *
 * @param props Document payload plus selection, nesting, permission, and review callbacks.
 * @returns The interactive document row for the topic detail file tree.
 */
export const DocumentItem = (props: DocumentItemProps) => {
  const {
    document,
    depth,
    isSelected,
    isReviewed,
    onSelectDocument,
    onToggleReviewed,
    selectedNormId,
    canMutateTopic,
  } = props;
  const { t } = useTranslation('MvpRedesign');
  const selectedNormLabel = useSelectedNormLabel();
  const hasFundstelleBadge = useFundstellenBadgePresenceForSelection({
    documentId: document.id,
    selectedNormId,
  });
  const fileName = document.filename.split('/').pop() ?? document.filename;
  const hasActiveSelectionContext = isSelected || Boolean(selectedNormLabel);

  return (
    <div
      className={cn(
        'relative flex w-full items-center gap-2 rounded-lg py-1 pr-1 text-left text-[13px] font-medium',
        isSelected
          ? cn(
              'selected-ring-inset text-[#1E40AF]',
              hasFundstelleBadge &&
                hasActiveSelectionContext &&
                'bg-[rgba(243,232,255,0.62)] hover:bg-[rgba(233,213,255,0.8)]',
            )
          : hasFundstelleBadge && hasActiveSelectionContext
            ? 'bg-[rgba(243,232,255,0.62)] text-[#1E1D49] hover:bg-[rgba(233,213,255,0.8)]'
            : 'text-[#1E1D49] hover:bg-bg-secondary',
      )}
      style={{ paddingLeft: `${depth * 16 + 28}px` }}
    >
      <button
        type="button"
        className="focus-ring-inset absolute inset-0 z-0 cursor-pointer rounded-lg bg-transparent"
        onClick={() => onSelectDocument(document.id)}
        aria-label={fileName}
        aria-current={isSelected ? 'true' : undefined}
        aria-pressed={isSelected}
      />
      <div className="pointer-events-none relative z-10 flex min-w-0 flex-1 items-center gap-2">
        <File
          className="size-4 shrink-0 text-text-secondary"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1 overflow-hidden">
          <TooltipWrapper content={fileName} onlyWhenOverflowing>
            <span className="block min-w-0 truncate text-left">{fileName}</span>
          </TooltipWrapper>
        </div>
      </div>
      {hasFundstelleBadge ? (
        <AiStatusChip
          ariaLabel={t('DocumentItem.aiSupportLabel')}
          tooltip={
            selectedNormLabel
              ? t('DocumentItem.aiSupportDescriptionForNorm', {
                  norm: selectedNormLabel,
                })
              : t('DocumentItem.aiSupportDescription')
          }
          className="relative z-10 shrink-0"
        />
      ) : null}
      <TopicDocumentReviewButton
        checked={isReviewed}
        className="relative z-10 shrink-0"
        disabled={!canMutateTopic}
        onCheckedChange={() => onToggleReviewed(document.id)}
      />
    </div>
  );
};
