import { IconChip } from '@/features/ui/icon-chip/IconChip';
import { formatDate } from '@/i18n/formatDate';
import { useLiveQuery } from '@tanstack/react-db';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { lawChangesCollection } from '../data/collections/lawChanges.collection';
import type {
  AggregatedLawChangeNormRef,
  LawChangeRecord,
} from '../data/lawChanges.types';
import {
  getAggregatedLawChangeMatches,
  getLawChangeNormLabel,
} from '../data/lawChanges.utils';
import { LawChangeCollectionStatusChip } from './LawChangeCollectionStatusChip';

type AggregatedLawChangeIndicatorProps = {
  norms: AggregatedLawChangeNormRef[];
};

export type AggregatedLawChangeIndicatorViewProps =
  AggregatedLawChangeIndicatorProps & {
    isErrorLawChanges?: boolean;
    lawChanges: LawChangeRecord[];
  };

export function AggregatedLawChangeIndicatorView(
  props: AggregatedLawChangeIndicatorViewProps,
) {
  const { isErrorLawChanges = false, lawChanges, norms } = props;
  const { t, i18n } = useTranslation('Rpb');

  if (isErrorLawChanges) {
    return <LawChangeCollectionStatusChip />;
  }

  const matchedLawChanges = getAggregatedLawChangeMatches(lawChanges, norms);
  const isSingleMatch = matchedLawChanges.length === 1;

  if (matchedLawChanges.length === 0) {
    return null;
  }

  const tooltip = (
    <div className="px-1 py-1 text-[11px] leading-[14px] tracking-[0.22px] text-white">
      <p className="whitespace-pre-wrap">
        {isSingleMatch
          ? t('rechtsaenderung.popoverIntroSingular')
          : t('rechtsaenderung.popoverIntroPlural')}
      </p>
      <p className="mt-3 whitespace-pre-wrap">
        {isSingleMatch
          ? t('rechtsaenderung.popoverAffectedNormSingular')
          : t('rechtsaenderung.popoverBetroffeneNormen')}
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-4">
        {matchedLawChanges.map((lawChange) => (
          <li key={lawChange.id}>
            {t('rechtsaenderung.aggregatedNormBullet', {
              normLabel: getLawChangeNormLabel({
                jurabk: lawChange.jurabk,
                paragraphNr: lawChange.paragraphNr,
              }),
              validFrom: formatDate(lawChange.validFrom, i18n.resolvedLanguage),
            })}
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <IconChip
      ariaLabel={t('rechtsaenderung.statusAria')}
      className="cursor-help border-red-600 bg-red-50 text-red-800"
      icon={<TriangleAlert />}
      tooltip={tooltip}
      tooltipArrowClassName="border-white/20 bg-neutral-800 fill-neutral-800"
      tooltipClassName="w-80 border-white/20 bg-neutral-800 px-2 py-[6px] text-white shadow-[inset_0_0_0_0.5px_rgba(255,255,255,0.6),0px_4px_16px_0px_rgba(2,6,23,0.1),0px_2px_4px_0px_rgba(2,6,23,0.1)]"
      tooltipSide="bottom"
      tooltipSideOffset={8}
    />
  );
}

export function AggregatedLawChangeIndicator(
  props: AggregatedLawChangeIndicatorProps,
) {
  const { data: lawChanges, isError } = useLiveQuery((q) =>
    q.from({ lawChanges: lawChangesCollection }),
  );

  return (
    <AggregatedLawChangeIndicatorView
      {...props}
      isErrorLawChanges={isError}
      lawChanges={lawChanges}
    />
  );
}
