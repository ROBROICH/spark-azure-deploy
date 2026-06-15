import { TooltipWrapper } from '@/features/ui/tooltip/TooltipWrapper';
import { Link } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export const NormCardManualBadge = () => {
  const { t } = useTranslation('MvpRedesign');
  const label = t('NormCardItem.manualNormTooltip');

  return (
    <TooltipWrapper content={label}>
      <span
        data-testid="manual-norm-badge"
        role="img"
        aria-label={label}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- tooltip trigger anchor; role="img" is intentional for a status indicator, tabIndex makes it keyboard-reachable
        tabIndex={0}
        className="focus-ring inline-flex rounded-[4px]"
      >
        <span className="inline-flex shrink-0 items-center justify-center rounded-[4px] border-[0.5px] border-[#174071] bg-[#D8E7FB] p-1 text-[#174071]">
          <Link aria-hidden="true" className="size-4" />
        </span>
      </span>
    </TooltipWrapper>
  );
};
