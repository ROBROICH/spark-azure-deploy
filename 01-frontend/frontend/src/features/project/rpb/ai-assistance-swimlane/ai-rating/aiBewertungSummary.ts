import type { NodePayloadByType } from '@/db/nodes/types';

const BEWERTUNG_RESULT_TRANSLATION_KEYS = {
  erfuellt: 'aiAssistance.assessmentResult.erfuellt',
  nicht_erfuellt: 'aiAssistance.assessmentResult.nicht_erfuellt',
  nicht_beurteilbar: 'aiAssistance.assessmentResult.nicht_beurteilbar',
} as const;

export const getAssessmentResultLabel = (
  t: (key: string, options?: Record<string, unknown>) => string,
  bewertung: Pick<NodePayloadByType<'bewertung'>, 'result'> | null,
) => {
  const result = bewertung?.result ?? '';
  switch (result) {
    case 'erfuellt':
    case 'nicht_erfuellt':
    case 'nicht_beurteilbar':
      return t(BEWERTUNG_RESULT_TRANSLATION_KEYS[result]);
    default:
      return result;
  }
};
