import { AiSparklesChip } from '@/features/ui/ai/AiSparklesChip';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBadge } from './StatusBadge';

type AiCardHeaderProps = {
  titleKey: string;
  badgeKey?: string;
  badgeLabel?: string;
  badgeVariant?: 'neutral' | 'success';
  accessory?: ReactNode;
  trailing?: ReactNode;
};

export function AiCardHeader(props: AiCardHeaderProps) {
  const {
    titleKey,
    badgeKey,
    badgeLabel,
    badgeVariant = 'success',
    accessory,
    trailing,
  } = props;
  const { t } = useTranslation('Rpb');
  const resolvedBadgeLabel = badgeLabel ?? (badgeKey ? t(badgeKey) : null);
  const shouldRenderBadge = badgeLabel !== undefined || badgeKey !== undefined;

  return (
    <div className="flex items-center gap-2 border-b border-slate-200 p-1">
      <AiSparklesChip size="sm" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate bg-gradient-to-b from-purple-600 to-purple-900 bg-clip-text text-[11px] leading-[14px] font-medium tracking-[0.02em] text-transparent">
        {t(titleKey)}
      </span>
      {shouldRenderBadge && resolvedBadgeLabel !== null && (
        <StatusBadge
          badge={{
            label: resolvedBadgeLabel,
            variant: badgeVariant,
          }}
        />
      )}
      {accessory}
      {trailing}
    </div>
  );
}
