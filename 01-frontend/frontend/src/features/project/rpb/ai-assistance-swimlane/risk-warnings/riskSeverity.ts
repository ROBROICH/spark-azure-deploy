import { CheckCircle2, CircleAlert, type LucideIcon } from 'lucide-react';
import type { Risk } from './riskWarning.types';

type SeverityTier = 'low' | 'medium' | 'high';

type SeverityTranslationKey =
  | 'riskWarnings.severity.low'
  | 'riskWarnings.severity.medium'
  | 'riskWarnings.severity.high';

type SeverityBadgeVariant = 'riskLow' | 'riskMedium' | 'riskHigh';

type SeverityInfo = {
  tier: SeverityTier;
  badgeVariant: SeverityBadgeVariant;
  labelKey: SeverityTranslationKey;
  Icon: LucideIcon;
};

const SEVERITY_INFO_BY_TIER = {
  high: {
    tier: 'high',
    badgeVariant: 'riskHigh',
    labelKey: 'riskWarnings.severity.high',
    Icon: CircleAlert,
  },
  medium: {
    tier: 'medium',
    badgeVariant: 'riskMedium',
    labelKey: 'riskWarnings.severity.medium',
    Icon: CircleAlert,
  },
  low: {
    tier: 'low',
    badgeVariant: 'riskLow',
    labelKey: 'riskWarnings.severity.low',
    Icon: CheckCircle2,
  },
} as const satisfies Record<SeverityTier, SeverityInfo>;

export const getRiskSeverityInfo = (
  severity: Risk['severity'],
): SeverityInfo => {
  if (severity >= 7) {
    return SEVERITY_INFO_BY_TIER.high;
  }
  if (severity >= 4) {
    return SEVERITY_INFO_BY_TIER.medium;
  }
  return SEVERITY_INFO_BY_TIER.low;
};
