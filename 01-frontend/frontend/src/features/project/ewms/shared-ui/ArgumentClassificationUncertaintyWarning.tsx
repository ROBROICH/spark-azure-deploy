import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { InfoTooltip } from '@/features/ui/info-tooltip/InfoTooltip';
import {
  getClassificationUncertainty,
  type ClassificationUncertaintyVariant,
} from '../data/ewms.classificationConfidence';
import type { EwmsArgumentNode } from '../data/ewms.nodes';

const VARIANT_KEYS = {
  topic: 'arguments.classificationUncertainTopic',
  subtopic: 'arguments.classificationUncertainSubtopic',
  both: 'arguments.classificationUncertainBoth',
} as const satisfies Record<ClassificationUncertaintyVariant, string>;

type ArgumentClassificationUncertaintyWarningProps = {
  argument: Pick<EwmsArgumentNode, 'topicConfidence' | 'subTopicConfidence'>;
};

export const ArgumentClassificationUncertaintyWarning = (
  props: ArgumentClassificationUncertaintyWarningProps,
) => {
  const { argument } = props;
  const { t } = useTranslation('Ewms');
  const variant = getClassificationUncertainty(argument);

  if (variant === null) {
    return null;
  }

  const label = t(VARIANT_KEYS[variant]);

  return (
    <InfoTooltip
      ariaLabel={label}
      content={label}
      icon={TriangleAlert}
      className="size-8 text-amber-700"
      iconClassName="size-4"
    />
  );
};
