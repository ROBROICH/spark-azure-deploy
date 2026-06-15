import { describe, expect, it } from 'vitest';
import { formatNormTextForDisplay } from './NormTextView';

describe('formatNormTextForDisplay', () => {
  it('joins generated definition-list markers with their text', () => {
    const text =
      'Von den Besitzverboten sind ausgenommen\n\n1.\n:   Tiere und Pflanzen\n\n    a)\n    :   in der Gemeinschaft gezuechtet';

    expect(formatNormTextForDisplay(text)).toBe(
      'Von den Besitzverboten sind ausgenommen\n\n1. Tiere und Pflanzen\n\n    a) in der Gemeinschaft gezuechtet',
    );
  });

  it('keeps ordinary colons unchanged', () => {
    const text =
      'Hinweis: Dieser Doppelpunkt bleibt.\n\nArtikel 9 der Verordnung bleibt unberuehrt.';

    expect(formatNormTextForDisplay(text)).toBe(text);
  });

  it('does not remove colon-prefixed lines without a preceding list marker', () => {
    const text = 'Einleitung\n:   kein Listenmarker davor';

    expect(formatNormTextForDisplay(text)).toBe(text);
  });
});
