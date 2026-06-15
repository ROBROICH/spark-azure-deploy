import { AiButton } from '@/features/ui/ai/AiButton';
import { AiStatusChip } from '@/features/ui/ai/AiStatusChip';
import { AI_SPARKLES_CHIP_BACKGROUND } from '@/features/ui/ai/AiSparklesChip';
import { AiSparklesIcon } from '@/features/ui/ai/AiSparklesIcon';
import { AiOutdatedBadge } from '@/features/ui/ai-outdated-badge/AiOutdatedBadge';
import { IconChip } from '@/features/ui/icon-chip/IconChip';
import { cn } from '@/features/ui/style/cn';
import { Check, CircleAlert } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
import { AiNormCardShell } from './AiNormCardShell';
import type { AiNormCardVariant } from './AiNormCardShell';

export type { AiNormCardVariant };
export type AiNormCardAiStatus =
  | 'none'
  | 'start'
  | 'loading'
  | 'current'
  | 'outdated';
export type AiNormCardReviewStatus = 'unchecked' | 'recheck' | 'checked';

export type AiNormCardAiAction = {
  ariaLabel: string;
  disabledTooltip?: ReactNode;
  isDisabled?: boolean;
  label: string;
  outdatedBadgeLabel?: string;
  outdatedBadgeTooltip?: ComponentProps<typeof AiOutdatedBadge>['tooltip'];
  status: AiNormCardAiStatus;
  tooltip?: ReactNode;
  onClick?: () => void;
};

export type AiNormCardReviewAction = {
  checkedLabel: string;
  disabled?: boolean;
  recheckLabel: string;
  status: AiNormCardReviewStatus;
  uncheckedLabel: string;
  onClick?: () => void;
};

type AiNormCardSelection = {
  ariaLabel: string;
  isSelected?: boolean;
  onSelect: () => void;
};

type AiNormCardProps = {
  aiAction?: AiNormCardAiAction;
  className?: string;
  headerIcons?: ReactNode;
  menu?: ReactNode;
  reviewAction: AiNormCardReviewAction;
  selection?: AiNormCardSelection;
  title: ReactNode;
  variant?: AiNormCardVariant;
};

const REVIEW_LABEL_BY_STATUS = {
  unchecked: 'uncheckedLabel',
  recheck: 'recheckLabel',
  checked: 'checkedLabel',
} as const satisfies Record<
  AiNormCardReviewStatus,
  keyof AiNormCardReviewAction
>;

const renderAiAction = (aiAction: AiNormCardAiAction | undefined) => {
  if (!aiAction || aiAction.status === 'none') {
    return <span className="inline-flex size-6 shrink-0" aria-hidden="true" />;
  }

  if (aiAction.status === 'current') {
    return aiAction.onClick ? (
      <AiStatusChip
        ariaLabel={aiAction.ariaLabel}
        tooltip={aiAction.tooltip}
        className="-mr-1"
        onClick={aiAction.onClick}
      />
    ) : (
      <IconChip
        as="span"
        ariaLabel={aiAction.ariaLabel}
        icon={<AiSparklesIcon />}
        tooltip={aiAction.tooltip}
        className="focus-ring -mr-1 border-purple-700 shadow-elevated"
        style={{ background: AI_SPARKLES_CHIP_BACKGROUND }}
        tabIndex={0}
      />
    );
  }

  if (
    aiAction.status === 'outdated' &&
    aiAction.outdatedBadgeLabel &&
    !aiAction.onClick
  ) {
    return (
      <AiOutdatedBadge
        label={aiAction.outdatedBadgeLabel}
        tooltip={aiAction.outdatedBadgeTooltip}
      />
    );
  }

  return (
    <AiButton
      label={aiAction.label}
      size="xs"
      isLoading={aiAction.status === 'loading'}
      isDisabled={
        aiAction.isDisabled ||
        aiAction.status === 'loading' ||
        !aiAction.onClick
      }
      disabledTooltip={aiAction.disabledTooltip}
      enabledTooltip={aiAction.tooltip}
      onClick={aiAction.onClick}
    />
  );
};

const AiNormCardReviewButton = (props: { action: AiNormCardReviewAction }) => {
  const { action } = props;
  const label = action[REVIEW_LABEL_BY_STATUS[action.status]];
  const isChecked = action.status === 'checked';
  const showAlert = action.status === 'recheck';
  const isDisabled = action.disabled || !action.onClick;

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-pressed={isChecked}
      className={cn(
        'focus-ring inline-flex h-6 items-center overflow-hidden rounded-[4px] font-medium tracking-[0.02em] whitespace-nowrap text-white shadow-elevated disabled:pointer-events-none disabled:text-neutral-400',
        isDisabled ? 'cursor-default' : 'cursor-pointer',
        isChecked ? 'bg-green-800' : 'bg-brand-950 hover:bg-brand-800',
      )}
      onClick={action.onClick}
    >
      <span className="inline-flex h-full items-center gap-1 px-2 text-[11px] leading-[14px]">
        {showAlert ? (
          <CircleAlert className="size-4 shrink-0" aria-hidden="true" />
        ) : null}
        {label}
      </span>
      <span
        className="flex items-center justify-center self-stretch border-l border-l-white/30 p-1"
        aria-hidden="true"
      >
        <Check className="size-4 shrink-0" />
      </span>
    </button>
  );
};

export function AiNormCard(props: AiNormCardProps) {
  const {
    aiAction,
    className,
    headerIcons,
    menu,
    reviewAction,
    selection,
    title,
    variant = 'default',
  } = props;

  return (
    <AiNormCardShell
      variant={variant}
      className={className}
      isSelectable={Boolean(selection)}
      isSelected={selection?.isSelected ?? false}
      selectButton={
        selection ? (
          <button
            type="button"
            data-slot="ai-norm-card-select-button"
            aria-label={selection.ariaLabel}
            aria-pressed={selection.isSelected}
            className="focus-ring absolute inset-0 z-10 cursor-pointer rounded-[inherit]"
            onClick={selection.onSelect}
          />
        ) : null
      }
      aiAction={renderAiAction(aiAction)}
      headerIcons={headerIcons}
      menu={menu}
      body={title}
      footer={<AiNormCardReviewButton action={reviewAction} />}
    />
  );
}
