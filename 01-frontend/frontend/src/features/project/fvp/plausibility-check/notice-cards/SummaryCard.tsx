import { useTranslation } from 'react-i18next';

type SummaryLabelKey =
  | 'redesign.summary.open'
  | 'redesign.summary.requested'
  | 'redesign.summary.irrelevant';

type SummaryCardProps = {
  labelKey: SummaryLabelKey;
  count: number;
};

export const SummaryCard = (props: SummaryCardProps) => {
  const { labelKey, count } = props;
  const { t } = useTranslation('PlausibilityCheck');

  return (
    <div className="flex min-h-24 flex-1 flex-col items-center justify-center gap-1 rounded-xl border-[0.5px] border-slate-400 bg-white px-2 py-6 text-center text-slate-600">
      <span className="text-[19px] leading-6 font-medium tracking-[-0.01em]">
        {count}
      </span>
      <span className="text-[13px] leading-[18px] font-medium">
        {t(labelKey)}
      </span>
    </div>
  );
};
