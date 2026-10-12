import { cn } from '@/features/ui/style/cn';
import { LoaderCircle, Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  EwmsArgumentNode,
  EwmsObjectionListItem,
} from '../../data/ewms.nodes';
import {
  getEwmsObjectionDisplayName,
  isEwmsArgumentApproved,
  resolveEwmsClassificationState,
} from '../../data/ewms.nodes';

type ObjectionRowProps = {
  objection: EwmsObjectionListItem;
  argumentsList: EwmsArgumentNode[];
  isSelected: boolean;
  onSelect: (id: string) => void;
};

/** Applies the workspace badge priority: prompt injection, loading, failed, then approval progress. */
export const ObjectionRow = (props: ObjectionRowProps) => {
  const { objection, argumentsList, isSelected, onSelect } = props;
  const displayName = getEwmsObjectionDisplayName(objection);
  const approvedCount = argumentsList.filter(isEwmsArgumentApproved).length;
  const totalCount = argumentsList.length;
  const { t } = useTranslation('Ewms');
  const classificationState = resolveEwmsClassificationState(objection);
  const extractionStatus = objection.entry.extractionStatus;
  const isWaitingForClassification = classificationState === 'loading';
  const isPromptInjection = extractionStatus === 'prompt_injection_error';
  const isClassificationFailed =
    classificationState === 'failed' || extractionStatus === 'failed';
  const isClassificationDone = classificationState === 'done';
  const isAllApproved =
    isClassificationDone && totalCount > 0 && approvedCount === totalCount;
  const showApprovedStyle = isClassificationDone && approvedCount > 0;

  const statusLabel = showApprovedStyle
    ? t('objections.approvedBadge', {
        approvedCount,
        count: totalCount,
        totalCount,
      })
    : t('objections.argumentsBadge', { count: totalCount });

  const buttonClass = cn(
    'flex h-8 w-full items-center gap-2 overflow-hidden rounded-lg p-1 text-left',
    'focus-ring',
    isSelected && 'selected-ring bg-blue-50',
    !isSelected && isAllApproved && 'bg-slate-50',
  );
  const nameClass = cn(
    'min-w-0 flex-1 overflow-hidden text-[13px] leading-[18px] tracking-[-0.13px] text-ellipsis whitespace-nowrap',
    isAllApproved ? 'font-medium text-green-900' : 'text-text-secondary',
    isSelected && !isAllApproved && 'font-medium text-text-primary',
  );
  const badgeClass = cn(
    'flex shrink-0 items-center justify-center rounded px-2 py-[5px] text-[11px] leading-[14px] font-medium tracking-[0.22px]',
    isPromptInjection || isClassificationFailed
      ? 'border border-red-200 bg-red-50 text-red-900'
      : showApprovedStyle
        ? 'border-0 bg-green-50 text-green-900 shadow-[inset_0_0_0_0.5px_rgb(34_197_94)]'
        : 'border border-border-primary bg-neutral-white text-text-secondary',
  );

  return (
    <div role="listitem">
      <button
        type="button"
        onClick={() => onSelect(objection.entry.fileId)}
        aria-pressed={isSelected}
        className={buttonClass}
      >
        <div className="flex items-center rounded p-1">
          <Mail className="size-4 text-text-secondary" />
        </div>
        <p className={nameClass}>{displayName}</p>
        {isPromptInjection ? (
          <div className={badgeClass}>{t('objections.promptInjection')}</div>
        ) : isWaitingForClassification ? (
          <div
            role="status"
            aria-label={t('objections.matching')}
            className={badgeClass}
          >
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
          </div>
        ) : isClassificationFailed ? (
          <div className={badgeClass}>{t('objections.failed')}</div>
        ) : (
          <div className={badgeClass}>{statusLabel}</div>
        )}
      </button>
    </div>
  );
};
