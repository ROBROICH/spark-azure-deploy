import { type DeadlineResponse } from '@/api-clients/pls-module';
import { cn } from '@/features/ui/style/cn';
import { formatDate } from '@/i18n/formatDate';

export type DeadlineReadRowProps = {
  deadline: DeadlineResponse;
  isPastDue?: boolean;
  locale?: string;
};

export function DeadlineReadRow(props: DeadlineReadRowProps) {
  const { deadline, isPastDue = false, locale } = props;
  return (
    <>
      <td className="px-3 py-[11px] text-sm tracking-tight text-text-secondary">
        {deadline.deadlineType}
      </td>
      <td className="px-3 py-[11px] text-sm tracking-tight text-text-secondary">
        <span className="line-clamp-1">{deadline.legalBasis ?? '—'}</span>
      </td>
      <td className="w-[129px] px-3 py-[11px] text-sm tracking-tight text-text-secondary">
        {formatDate(deadline.startAt, locale)}
      </td>
      <td
        className={cn(
          'w-[129px] px-3 py-[11px] text-sm tracking-tight text-text-secondary',
          isPastDue && 'font-bold text-text-error',
        )}
      >
        {formatDate(deadline.endAt, locale)}
      </td>
    </>
  );
}
