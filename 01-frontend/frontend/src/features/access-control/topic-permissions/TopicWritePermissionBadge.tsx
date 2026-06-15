import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { IconChip } from '@/features/ui/icon-chip/IconChip';
import { cn } from '@/features/ui/style/cn';
import { Lock, LockOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  type TopicWritePermissionState,
  useTopicWritePermission,
} from './hasTopicMutationRights';

type TopicWritePermissionBadgeVariant = 'large' | 'small';

type TopicWritePermissionBadgeBaseProps = {
  className?: string;
  variant: TopicWritePermissionBadgeVariant;
};

type TopicWritePermissionBadgeProps = TopicWritePermissionBadgeBaseProps &
  (
    | {
        assigneeIds: string[] | null;
        permission?: undefined;
      }
    | {
        assigneeIds?: undefined;
        permission: TopicWritePermissionState;
      }
  );

const badgeVariantClasses = {
  large:
    'h-6 cursor-help select-none items-center justify-center gap-1 px-2 text-[11px] leading-[14px] font-medium tracking-[0.02em]',
  small: 'cursor-help select-none',
} satisfies Record<TopicWritePermissionBadgeVariant, string>;

export function TopicWritePermissionBadge(
  props: TopicWritePermissionBadgeProps,
) {
  if (props.permission !== undefined) {
    return (
      <TopicWritePermissionBadgeContent
        className={props.className}
        permission={props.permission}
        variant={props.variant}
      />
    );
  }

  return (
    <TopicWritePermissionBadgeWithAssignees
      assigneeIds={props.assigneeIds}
      className={props.className}
      variant={props.variant}
    />
  );
}

function TopicWritePermissionBadgeWithAssignees(
  props: TopicWritePermissionBadgeBaseProps & {
    assigneeIds: string[] | null;
  },
) {
  const { assigneeIds, className, variant } = props;
  const getTopicWritePermission = useTopicWritePermission();
  const permission = getTopicWritePermission(assigneeIds);

  return (
    <TopicWritePermissionBadgeContent
      className={className}
      permission={permission}
      variant={variant}
    />
  );
}

function TopicWritePermissionBadgeContent(
  props: TopicWritePermissionBadgeBaseProps & {
    permission: TopicWritePermissionState;
  },
) {
  const { className, permission, variant } = props;
  const { t } = useTranslation('Project');
  const label = permission.canWrite
    ? t('TopicWritePermissionBadge.editable')
    : t('TopicWritePermissionBadge.notEditable');
  const tooltip = t(`TopicWritePermissionBadge.tooltip.${permission.reason}`);
  const Icon = permission.canWrite ? LockOpen : Lock;
  const colorClassName = permission.canWrite
    ? 'border-green-600 bg-green-50 text-green-800'
    : 'border-slate-400 bg-white text-slate-600';

  if (variant === 'small') {
    return (
      <IconChip
        ariaLabel={`${label}: ${tooltip}`}
        className={cn(colorClassName, badgeVariantClasses.small, className)}
        icon={<Icon />}
        tooltip={tooltip}
        tooltipTriggerMode="click"
      />
    );
  }

  return (
    <TooltipWrapper content={tooltip} triggerMode="click">
      <button
        type="button"
        aria-label={`${label}: ${tooltip}`}
        className={cn(
          'focus-ring inline-flex shrink-0 rounded-[4px] border-[0.5px]',
          colorClassName,
          badgeVariantClasses.large,
          className,
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span>{label}</span>
      </button>
    </TooltipWrapper>
  );
}
