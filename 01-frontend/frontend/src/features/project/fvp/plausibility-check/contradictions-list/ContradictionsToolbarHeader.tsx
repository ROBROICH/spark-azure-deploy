import { CircleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { InfoTooltip } from '@/features/ui/info-tooltip/InfoTooltip';

type ContradictionsToolbarHeaderProps = {
  totalCount: number;
};

export const ContradictionsToolbarHeader = (
  props: ContradictionsToolbarHeaderProps,
) => {
  const { totalCount } = props;
  const { t } = useTranslation('PlausibilityCheck');

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex size-8 items-center justify-center rounded-lg bg-slate-200 text-brand-950">
          <CircleAlert aria-hidden="true" className="size-4" />
        </span>
        <h3 className="text-base leading-5 font-medium tracking-[-0.01em] text-brand-950">
          {t('redesign.hintsTitle', { count: totalCount })}
        </h3>
      </div>
      <InfoTooltip
        ariaLabel={t('ContradictionsList.infoLabel')}
        content={t('ContradictionsList.info')}
        className="size-4 text-slate-500"
        iconClassName="size-4"
        tooltipMaxWidthClassName="max-w-[36rem]"
      />
    </div>
  );
};
