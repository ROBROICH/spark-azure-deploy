import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SelectMenuItem } from '@/features/ui/select-menu/SelectMenu';
import type { RpbSearch } from '../../rpb.search';
import { AiTopicHeader } from './AiTopicHeader';

const routeState = vi.hoisted<{ search: RpbSearch }>(() => ({
  search: {},
}));

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useSearch: (options?: { select?: (search: RpbSearch) => unknown }) => {
      const search = routeState.search;

      if (options?.select) {
        return options.select(search);
      }

      return search;
    },
    useNavigate: () => mocks.navigateMock,
  }),
}));

vi.mock('@/db/nodes/hooks/useGraph', () => ({
  useGraph: () => ({
    topics: [
      {
        id: 'topic-1',
        name: 'Topic 1',
      },
    ],
  }),
}));

vi.mock('@/db/nodes/hooks/useTopicNodes', () => ({
  useTopicNodes: () => ({
    data: [
      {
        id: 'topic-1',
        name: 'Topic 1',
      },
    ],
  }),
}));

vi.mock('@/features/ui/swimlanes/SwimlaneHeaderPortal', () => ({
  SwimlaneHeaderPortal: (props: { children: ReactNode }) => (
    <div>{props.children}</div>
  ),
}));

vi.mock('@/features/ui/select-menu/SelectMenu', () => ({
  SelectMenu: (props: {
    items: SelectMenuItem[];
    onChange: (value: string) => void;
  }) => (
    <button
      type="button"
      onClick={() => props.onChange(props.items.at(0)?.value ?? '')}
    >
      {props.items.at(0)?.label}
    </button>
  ),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('AiTopicHeader', () => {
  afterEach(cleanup);

  beforeEach(() => {
    routeState.search = {};
    mocks.navigateMock.mockReset();
    mocks.navigateMock.mockImplementation(
      (options: { search?: (prev: RpbSearch) => RpbSearch }) => {
        if (options.search) {
          routeState.search = options.search(routeState.search);
        }
      },
    );
  });

  it('clears topic-scoped detail state through the no-topic clear option', async () => {
    const user = userEvent.setup();
    routeState.search = {
      outlineNodeId: 'topicless-root',
      participationSubtopicId: '__sonstige__',
      topicId: 'topic-1',
      topicNormId: 'topic-norm-1',
    };

    render(
      <AiTopicHeader titleKey="aiAssistance.title" allowEmptyTopicSelection />,
    );

    await user.click(
      screen.getByRole('button', {
        name: 'aiAssistance.selectTopic',
      }),
    );

    expect(mocks.navigateMock).toHaveBeenCalled();
    expect(routeState.search).toMatchObject({
      outlineNodeId: 'topicless-root',
      participationSubtopicId: undefined,
      topicId: undefined,
      topicNormId: undefined,
    });
  });
});
