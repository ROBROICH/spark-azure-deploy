import { StatusBadge } from '@/features/ui/status-badge/StatusBadge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/features/ui/tooltip/Tooltip';
import type { ReactNode } from 'react';

type EwmsFailureReasonBadgeProps = {
  children: ReactNode;
  tooltip?: ReactNode;
};

export const EwmsFailureReasonBadge = (props: EwmsFailureReasonBadgeProps) => {
  const { children, tooltip } = props;
  const badge = (
    <StatusBadge variant="error" size="sm">
      {children}
    </StatusBadge>
  );

  if (!tooltip) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-72 text-[13px] leading-[18px] text-wrap"
      >
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
};
