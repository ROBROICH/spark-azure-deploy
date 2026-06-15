import { IconChip } from '@/features/ui/icon-chip/IconChip';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function LawChangeCollectionStatusChip() {
  const { t } = useTranslation('Rpb');

  return (
    <IconChip
      ariaLabel={t('rechtsaenderung.loadErrorAria')}
      className="cursor-help border-red-600 bg-red-50 text-red-800"
      icon={<TriangleAlert />}
      tooltip={t('rechtsaenderung.loadErrorTooltip')}
      tooltipSide="bottom"
      tooltipSideOffset={8}
    />
  );
}
