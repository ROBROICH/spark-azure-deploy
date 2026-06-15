import { Badge } from '@/features/ui/badge/Badge';
import { useTranslation } from 'react-i18next';
import { sectionBadgeClassName } from './AiSatzDetailSectionShared';
import type {
  NormTypeBadgeDescriptor,
  NormTypeBadgeKey,
} from './normTypeBadgeLabels';

type NormTypeBadgeProps =
  | {
      typeKey: NormTypeBadgeKey;
      badge?: never;
    }
  | {
      badge: NormTypeBadgeDescriptor;
      typeKey?: never;
    };

const getNormTypeBadgeLabel = (
  props: NormTypeBadgeProps,
  t: (key: string) => string,
) => {
  if (props.badge?.kind === 'label') {
    return props.badge.value;
  }

  if (props.badge?.kind === 'key') {
    return t(`aiAssistance.normTypeBadge.${props.badge.value}`);
  }

  return t(`aiAssistance.normTypeBadge.${props.typeKey}`);
};

export const NormTypeBadge = (props: NormTypeBadgeProps) => {
  const { t } = useTranslation('Rpb');
  const label = getNormTypeBadgeLabel(props, t);

  return (
    <Badge variant="neutral" size="small" className={sectionBadgeClassName}>
      {label}
    </Badge>
  );
};
