import { describe, expect, it } from 'vitest';
import { formatAbsatzSatzTitle } from './formatAbsatzSatzTitle';

const t = (key: string, options?: Record<string, unknown>) => {
  const translations: Record<string, string> = {
    'aiAssistance.satzTitle': `Absatz ${String(options?.absatz)} Satz ${String(options?.satz)}`,
    'aiAssistance.satzTitleWithMarker': `Absatz ${String(options?.absatz)} Satz ${String(options?.satz)} ${String(options?.marker)}`,
    'aiAssistance.satzTitleWithoutSatz': `Absatz ${String(options?.absatz)}`,
    'aiAssistance.satzTitleWithoutSatzWithMarker': `Absatz ${String(options?.absatz)} ${String(options?.marker)}`,
  };

  return translations[key] ?? key;
};

describe('formatAbsatzSatzTitle', () => {
  it('returns null without an Absatz number', () => {
    expect(
      formatAbsatzSatzTitle(t, {
        absatzNr: null,
        satzNr: '1',
      }),
    ).toBeNull();
  });

  it('returns null for the default single Absatz and Satz title without marker', () => {
    expect(
      formatAbsatzSatzTitle(
        t,
        {
          absatzNr: '1',
          satzNr: '1',
        },
        {
          hasMultipleAbsaetze: false,
          hasMultipleSaetze: false,
        },
      ),
    ).toBeNull();
  });

  it('formats Absatz and Satz numbers by default', () => {
    expect(
      formatAbsatzSatzTitle(t, {
        absatzNr: ' 2 ',
        satzNr: ' 3 ',
      }),
    ).toBe('Absatz 2 Satz 3');
  });

  it('keeps marker labels visible for single-sentence Absaetze', () => {
    expect(
      formatAbsatzSatzTitle(
        t,
        {
          absatzNr: '4',
          satzNr: '1',
        },
        {
          hasMultipleSaetze: false,
          markerLabel: 'Nr. 2',
        },
      ),
    ).toBe('Absatz 4 Nr. 2');
  });
});
