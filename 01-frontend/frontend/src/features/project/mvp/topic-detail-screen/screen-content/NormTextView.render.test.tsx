import '@testing-library/jest-dom/vitest';
import type { CompositeKey } from '@/db/nodes/compositeKey';
import type { NodePayloadByType } from '@/db/nodes/types';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TopicNormEntry } from '../screen-data/useRechtsgrundlageData.helpers';
import { NormTextView } from './NormTextView';

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useNavigate: () => mocks.navigateMock,
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations = {
        'NormTextView.backAriaLabel': 'Zurück zur Übersicht',
        'NormTextView.normTextRegionAriaLabel': 'Normtext',
        'NormCardItem.geprueft': 'Geprüft',
        'NormCardItem.pruefen': 'Prüfen',
      } satisfies Record<string, string>;

      if (key in translations) {
        return translations[key as keyof typeof translations];
      }

      return key;
    },
  }),
}));

vi.mock('@/features/project/law-changes/ui/LawChangeIndicator', () => ({
  LawChangeIndicatorView: (props: {
    jurabk: string;
    onOpen: (lawChange: { id: string }) => void;
    paragraphNr?: string | null;
  }) => (
    <button
      type="button"
      data-jurabk={props.jurabk}
      data-paragraph-nr={props.paragraphNr}
      onClick={() => props.onOpen({ id: 'law-change-45a' })}
    >
      Rechtsänderung anzeigen
    </button>
  ),
}));

vi.mock('@/features/ui/button/Button', () => ({
  Button: (props: ComponentProps<'button'> & { iconOnly?: boolean }) => {
    const {
      children,
      iconOnly: _iconOnly,
      type = 'button',
      ...buttonProps
    } = props;

    return (
      <button type={type} {...buttonProps}>
        {children}
      </button>
    );
  },
}));

vi.mock('@/features/ui/button/SplitButton', () => ({
  SplitButton: (props: {
    checked: boolean;
    checkedLabel: string;
    disabled?: boolean;
    uncheckedLabel: string;
  }) => (
    <button type="button" disabled={props.disabled}>
      {props.checked ? props.checkedLabel : props.uncheckedLabel}
    </button>
  ),
}));

const topicNorm = {
  id: 'topic-norm-1',
  node_type: 'topic_norm',
  compositeKey: 'topic_norm:topic-norm-1' as CompositeKey,
  project_id: 'verfahren-1',
  is_deleted: false,
  is_outdated: false,
  frontend_parent_ids: ['topic:topic-1'],
  project_version: 1,
  update_type: 'manual',
  created_at: '2026-04-09T00:00:00.000Z',
  updated_at: '2026-04-09T00:00:00.000Z',
  jurabk: 'BNatSchG',
  paragraph_nr: '45a',
  satz: null,
  absatz: null,
  nummer: null,
  mvp_status: 'unchecked',
  satz_statuses: {},
  sys_period: null,
  topic_id: 'topic-1',
  type: 'pruefung',
} satisfies NodePayloadByType<'topic_norm'>;

const norm = {
  id: 'norm-1',
  node_type: 'norm',
  compositeKey: 'norm:norm-1' as CompositeKey,
  project_id: 'verfahren-1',
  is_deleted: false,
  is_outdated: false,
  frontend_parent_ids: ['topic_norm:topic-norm-1'],
  project_version: 1,
  update_type: 'manual',
  created_at: '2026-04-09T00:00:00.000Z',
  updated_at: '2026-04-09T00:00:00.000Z',
  gesetz_id: 'gesetz-1',
  paragraph_nr: '45a',
  paragraph_titel: 'Umgang mit gebietsfremden Arten',
  regelungsgegenstand: null,
  sys_period: null,
  text: 'Bisheriger Normtext',
} satisfies NodePayloadByType<'norm'>;

const selectedNorm = {
  gesetz: null,
  norm,
  topicNorm,
} satisfies TopicNormEntry;

describe('NormTextView', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.navigateMock.mockReset();
  });

  it('opens the law-change dialog from the norm-text header', async () => {
    const user = userEvent.setup();

    render(
      <NormTextView
        canMutateTopic
        lawChanges={[]}
        selectedNorm={selectedNorm}
        onBack={vi.fn()}
        onToggleReviewed={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Rechtsänderung anzeigen' }),
    );

    const navigateOptions = mocks.navigateMock.mock.calls[0]?.[0];
    expect(navigateOptions).toBeDefined();
    if (!navigateOptions) {
      throw new Error('Expected navigation options');
    }
    const nextSearch = navigateOptions.search({
      detailDocumentId: 'topic-norm-1',
    });

    expect(nextSearch).toEqual({
      detailDocumentId: 'topic-norm-1',
      lawChangeId: 'law-change-45a',
    });
    expect(navigateOptions.replace).toBe(true);
    expect(navigateOptions.resetScroll).toBe(false);
  });
});
