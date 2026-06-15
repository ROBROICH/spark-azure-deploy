import { IconChip } from '@/features/ui/icon-chip/IconChip';
import { useLiveQuery } from '@tanstack/react-db';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { lawChangesCollection } from '../data/collections/lawChanges.collection';
import {
  type LawChangeNormRef,
  type LawChangeRecord,
} from '../data/lawChanges.types';
import { getLawChangeMatchesForNorm } from '../data/lawChanges.utils';
import { LawChangeCollectionStatusChip } from './LawChangeCollectionStatusChip';

type LawChangeIndicatorProps = LawChangeNormRef & {
  onOpen: (lawChange: LawChangeRecord) => void;
};

export type LawChangeIndicatorViewProps = LawChangeIndicatorProps & {
  isErrorLawChanges?: boolean;
  lawChanges: LawChangeRecord[];
};

export function LawChangeIndicatorView(props: LawChangeIndicatorViewProps) {
  const {
    isErrorLawChanges = false,
    jurabk,
    lawChanges,
    paragraphNr,
    onOpen,
  } = props;
  const { t } = useTranslation('Rpb');

  if (isErrorLawChanges) {
    return <LawChangeCollectionStatusChip />;
  }

  const matchingLawChanges = getLawChangeMatchesForNorm(lawChanges, {
    jurabk,
    paragraphNr,
  });

  if (matchingLawChanges.length === 0) {
    return null;
  }

  return (
    <IconChip
      ariaLabel={t('rechtsaenderung.dialogTriggerAria')}
      className="border-red-600 bg-red-50 text-red-800"
      icon={<TriangleAlert />}
      onClick={(event) => {
        event.stopPropagation();
        const firstLawChange = matchingLawChanges.at(0);
        if (firstLawChange) {
          onOpen(firstLawChange);
        }
      }}
    />
  );
}

export function LawChangeIndicator(props: LawChangeIndicatorProps) {
  const { data: lawChanges, isError } = useLiveQuery((q) =>
    q.from({ lawChanges: lawChangesCollection }),
  );

  return (
    <LawChangeIndicatorView
      {...props}
      isErrorLawChanges={isError}
      lawChanges={lawChanges}
    />
  );
}
