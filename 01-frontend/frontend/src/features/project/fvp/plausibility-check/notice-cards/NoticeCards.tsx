import type { PlausibilityContradictionsSummary } from '@/features/project/fvp/data/plausibility/usePlausibilityContradictionsSummary';
import { NoticeCardsSkeleton } from './NoticeCardsSkeleton';
import { SummaryCard } from './SummaryCard';

type NoticeCardsProps = {
  summary: PlausibilityContradictionsSummary;
  isLoading: boolean;
};

export const NoticeCards = (props: NoticeCardsProps) => {
  const { summary, isLoading } = props;

  if (isLoading) {
    return <NoticeCardsSkeleton />;
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-3">
      <SummaryCard labelKey="redesign.summary.open" count={summary.open} />
      <SummaryCard
        labelKey="redesign.summary.requested"
        count={summary.onRequestList}
      />
      <SummaryCard
        labelKey="redesign.summary.irrelevant"
        count={summary.ignored}
      />
    </div>
  );
};
