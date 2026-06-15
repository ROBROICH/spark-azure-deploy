import { describe, expect, it } from 'vitest';
import { getAssessmentResultLabel } from './aiBewertungSummary';

const t = (key: string) => {
  const translations: Record<string, string> = {
    'aiAssistance.assessmentResult.erfuellt': 'Erfuellt',
    'aiAssistance.assessmentResult.nicht_erfuellt': 'Nicht erfuellt',
    'aiAssistance.assessmentResult.nicht_beurteilbar': 'Nicht beurteilbar',
  };

  return translations[key] ?? key;
};

describe('getAssessmentResultLabel', () => {
  it('maps persisted bewertung result values to translated neutral badge labels', () => {
    expect(
      getAssessmentResultLabel(t, {
        result: 'erfuellt',
      }),
    ).toBe('Erfuellt');

    expect(
      getAssessmentResultLabel(t, {
        result: 'nicht_erfuellt',
      }),
    ).toBe('Nicht erfuellt');

    expect(
      getAssessmentResultLabel(t, {
        result: 'nicht_beurteilbar',
      }),
    ).toBe('Nicht beurteilbar');
  });

  it('returns an empty string when result is empty instead of inventing fallback copy', () => {
    expect(
      getAssessmentResultLabel(t, {
        result: '',
      }),
    ).toBe('');
  });
});
