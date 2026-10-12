import { toCompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { describe, expect, it } from 'vitest';
import { formatSatzTitle } from './formatSatzTitle';

const t = (key: string, options?: Record<string, unknown>) => {
  const translations: Record<string, string> = {
    'aiAssistance.satzTitle': `Absatz ${String(options?.absatz ?? '')} Satz ${String(options?.satz ?? '')}`,
    'aiAssistance.satzTitleWithMarker': `Absatz ${String(options?.absatz ?? '')} Satz ${String(options?.satz ?? '')} ${String(options?.marker ?? '')}`,
    'aiAssistance.satzTitleWithoutSatz': `Absatz ${String(options?.absatz ?? '')}`,
    'aiAssistance.satzTitleWithoutSatzWithMarker': `Absatz ${String(options?.absatz ?? '')} ${String(options?.marker ?? '')}`,
    'aiAssistance.satzMarkerNumber': `Nr. ${String(options?.marker ?? '')}`,
    'aiAssistance.satzMarkerLetter': `${String(options?.marker ?? '')})`,
    'aiAssistance.satzMarkerDoubleLetter': `${String(options?.marker ?? '')})`,
  };

  return translations[key] ?? key;
};

const createAbsatz = (
  overrides: Partial<NodePayloadByType<'absatz'>> = {},
): NodePayloadByType<'absatz'> => {
  const id = overrides.id ?? 'absatz-1';

  return {
    absatzNr: '1',
    compositeKey: toCompositeKey({ id, nodeType: 'absatz' }),
    createdAt: '2026-01-01T00:00:00Z',
    frontendParentIds: [],
    id,
    isDeleted: false,
    isOutdated: false,
    normId: 'norm-1',
    nodeType: 'absatz',
    projectId: 'project-1',
    projectVersion: 1,
    text: '',
    updateType: null,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  } satisfies NodePayloadByType<'absatz'>;
};

const createSatz = (
  overrides: Partial<NodePayloadByType<'satz'>> = {},
): NodePayloadByType<'satz'> => {
  const id = overrides.id ?? 'satz-1';

  return {
    absatzId: 'absatz-1',
    compositeKey: toCompositeKey({ id, nodeType: 'satz' }),
    createdAt: '2026-01-01T00:00:00Z',
    formel: null,
    frontendParentIds: [],
    id,
    isDeleted: false,
    isOutdated: false,
    markers: [],
    nodeType: 'satz',
    normTypLvl1: null,
    normTypLvl2: null,
    position: 42,
    projectId: 'project-1',
    projectVersion: 1,
    satzNr: '1',
    lastSuzResultId: null,
    tatbestandsmerkmale: null,
    text: '',
    updateType: null,
    updatedAt: '2026-01-01T00:00:00Z',
    wennDann: null,
    ...overrides,
  } satisfies NodePayloadByType<'satz'>;
};

describe('formatSatzTitle', () => {
  it('uses markers as the rendered sentence label', () => {
    const absatz = createAbsatz();
    const satz = createSatz({
      satzNr: '99',
      markers: ['3', 'ii'],
    });
    const title = formatSatzTitle(t, absatz, satz);

    expect(title).toBe('Absatz 1 Satz 99 Nr. 3 ii)');
  });

  it('trims and skips empty markers', () => {
    const absatz = createAbsatz();
    const satz = createSatz({
      satzNr: '99',
      markers: [' ', ' 3 ', '', ' ii '],
    });
    const title = formatSatzTitle(t, absatz, satz);

    expect(title).toBe('Absatz 1 Satz 99 Nr. 3 ii)');
  });

  it('omits the sentence number for a single sentence Absatz with markers', () => {
    const absatz = createAbsatz();
    const satz = createSatz({
      markers: ['2'],
    });
    const title = formatSatzTitle(t, absatz, satz, {
      hasMultipleSaetze: false,
    });

    expect(title).toBe('Absatz 1 Nr. 2');
  });

  it('falls back to the sentence number when markers are not available', () => {
    const absatz = createAbsatz();
    const satz = createSatz({
      satzNr: '7',
    });
    const title = formatSatzTitle(t, absatz, satz);

    expect(title).toBe('Absatz 1 Satz 7');
  });

  it('returns null for a single-absatz single-satz norm without markers', () => {
    const absatz = createAbsatz();
    const satz = createSatz();
    const title = formatSatzTitle(t, absatz, satz, {
      hasMultipleAbsaetze: false,
      hasMultipleSaetze: false,
    });

    expect(title).toBeNull();
  });

  it('ignores invalid marker formats', () => {
    const absatz = createAbsatz();
    const satz = createSatz({
      satzNr: '4',
      markers: ['Nr 5', 'iii'],
    });
    const title = formatSatzTitle(t, absatz, satz);

    expect(title).toBe('Absatz 1 Satz 4');
  });
});
