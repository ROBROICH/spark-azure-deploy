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
    absatz_nr: '1',
    compositeKey: toCompositeKey({ id, node_type: 'absatz' }),
    created_at: '2026-01-01T00:00:00Z',
    frontend_parent_ids: [],
    id,
    is_deleted: false,
    is_outdated: false,
    norm_id: 'norm-1',
    node_type: 'absatz',
    project_id: 'project-1',
    project_version: 1,
    sys_period: null,
    text: '',
    update_type: null,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } satisfies NodePayloadByType<'absatz'>;
};

const createSatz = (
  overrides: Partial<NodePayloadByType<'satz'>> = {},
): NodePayloadByType<'satz'> => {
  const id = overrides.id ?? 'satz-1';

  return {
    absatz_id: 'absatz-1',
    compositeKey: toCompositeKey({ id, node_type: 'satz' }),
    created_at: '2026-01-01T00:00:00Z',
    formel: null,
    frontend_parent_ids: [],
    id,
    is_deleted: false,
    is_outdated: false,
    markers: [],
    node_type: 'satz',
    norm_typ_lvl_1: null,
    norm_typ_lvl_2: null,
    position: 42,
    project_id: 'project-1',
    project_version: 1,
    satz_nr: '1',
    sys_period: null,
    tatbestandsmerkmale: null,
    text: '',
    update_type: null,
    updated_at: '2026-01-01T00:00:00Z',
    wenn_dann: null,
    ...overrides,
  } satisfies NodePayloadByType<'satz'>;
};

describe('formatSatzTitle', () => {
  it('uses markers as the rendered sentence label', () => {
    const absatz = createAbsatz();
    const satz = createSatz({
      satz_nr: '99',
      markers: ['3', 'ii'],
    });
    const title = formatSatzTitle(t, absatz, satz);

    expect(title).toBe('Absatz 1 Satz 99 Nr. 3 ii)');
  });

  it('trims and skips empty markers', () => {
    const absatz = createAbsatz();
    const satz = createSatz({
      satz_nr: '99',
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
      satz_nr: '7',
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
      satz_nr: '4',
      markers: ['Nr 5', 'iii'],
    });
    const title = formatSatzTitle(t, absatz, satz);

    expect(title).toBe('Absatz 1 Satz 4');
  });
});
