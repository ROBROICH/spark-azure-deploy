import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getFirstNavigateSearch } from '@/features/project/test/projectUiTestMocks';
import { AiNormtextView } from './AiNormtextView';

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  topicNorm: {
    id: 'topic-norm-1',
    jurabk: 'BNatSchG',
    node_type: 'topic_norm',
    paragraph_nr: '45a',
  } as {
    id: string;
    jurabk: string;
    node_type: 'topic_norm';
    paragraph_nr: string;
  } | null,
}));

vi.mock('@tanstack/react-router', async () => {
  const { MockRouterLink } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    getRouteApi: () => ({
      useNavigate: () => mocks.navigateMock,
      useParams: () => ({ verfahrenId: 'verfahren-1' }),
    }),
    Link: MockRouterLink,
  };
});

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'aiAssistance.backToNorm': 'Zurück zur Norm',
        'aiAssistance.legalText': 'Normtext',
      };

      return translations[key] ?? key;
    },
  }),
}));

vi.mock('@/db/nodes/hooks/useDescendants', () => ({
  useDescendants: () => [{ id: 'norm-1', node_type: 'norm' }],
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNode: (nodeRef: { id: string; node_type: string } | null) => {
    if (nodeRef?.node_type === 'norm') {
      return {
        data: {
          id: nodeRef.id,
          node_type: 'norm',
          paragraph_nr: '45a',
          paragraph_titel: 'Umgang mit gebietsfremden Arten',
          text: 'Bisheriger Normtext',
        },
      };
    }

    return { data: null };
  },
}));

vi.mock('@/db/nodes/hooks/useLiveNodes', () => ({
  useLiveNode: (nodeRef: { id: string; node_type: string } | null) => {
    if (nodeRef?.node_type === 'topic_norm') {
      return { data: mocks.topicNorm };
    }

    return { data: null };
  },
}));

vi.mock('@/features/project/law-changes/ui/LawChangeIndicator', async () => {
  const { createLawChangeIndicatorMock } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    LawChangeIndicator: createLawChangeIndicatorMock('law-change-45a'),
  };
});

vi.mock('@/features/ui/swimlanes/SwimlaneHeaderPortal', async () => {
  const { MockSwimlaneHeaderPortal } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    SwimlaneHeaderPortal: MockSwimlaneHeaderPortal,
  };
});

vi.mock('@/features/ui/button/Button', async () => {
  const { MockButton } =
    await import('@/features/project/test/projectUiTestMocks');

  return {
    Button: MockButton,
  };
});

describe('AiNormtextView', () => {
  afterEach(cleanup);

  beforeEach(() => {
    mocks.navigateMock.mockReset();
    mocks.topicNorm = {
      id: 'topic-norm-1',
      jurabk: 'BNatSchG',
      node_type: 'topic_norm',
      paragraph_nr: '45a',
    };
  });

  it('opens the law-change dialog from the norm-text header', async () => {
    const user = userEvent.setup();

    render(
      <AiNormtextView
        topicNormRef={{ id: 'topic-norm-1', node_type: 'topic_norm' }}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Rechtsänderung anzeigen' }),
    );

    const { navigateOptions, nextSearch } = getFirstNavigateSearch<
      {
        showNormtext: boolean;
        topicNormId: string;
      },
      {
        lawChangeId: string;
        showNormtext: boolean;
        topicNormId: string;
      }
    >(mocks.navigateMock, {
      showNormtext: true,
      topicNormId: 'topic-norm-1',
    });

    expect(nextSearch).toEqual({
      showNormtext: true,
      topicNormId: 'topic-norm-1',
      lawChangeId: 'law-change-45a',
    });
    expect(navigateOptions.replace).toBe(true);
    expect(navigateOptions.resetScroll).toBe(false);
  });

  it('renders legal text without the optional law-change metadata', () => {
    mocks.topicNorm = null;

    render(
      <AiNormtextView
        topicNormRef={{ id: 'topic-norm-1', node_type: 'topic_norm' }}
      />,
    );

    expect(screen.getByText('Bisheriger Normtext')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Rechtsänderung anzeigen' }),
    ).not.toBeInTheDocument();
  });
});
