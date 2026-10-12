import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  BeschlussDocument,
  BeschlussNode,
  DokumenteDocument,
  GesetzesgrundlageDocument,
  Usecase,
} from '../data/usecaseApi';
import { catalogUsecaseQueryKey } from '../catalog/usecaseQueries';
import { DecisionTemplateDraftSection } from './DecisionTemplateDraftSection';

const mocks = vi.hoisted(() => ({
  updateCatalogUsecase: vi.fn(),
  showMutationErrorToast: vi.fn((_options?: unknown) => true),
}));

vi.mock('@/api-clients/backend/sdk.gen', () => ({}));

vi.mock('../data/usecaseApi', () => ({
  updateCatalogUsecase: (...args: unknown[]) =>
    mocks.updateCatalogUsecase(...args),
}));

vi.mock('@/integrations/api-clients/mutationErrorToast', () => ({
  showMutationErrorToast: (options: unknown) =>
    mocks.showMutationErrorToast(options),
  isMutationToastHandledError: () => false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string; title?: string }) => {
      if (!options) {
        return key;
      }
      if (options.title && options.name) {
        return `${key}:${options.title}:${options.name}`;
      }
      if (options.name) {
        return `${key}:${options.name}`;
      }
      if (options.title) {
        return `${key}:${options.title}`;
      }
      return key;
    },
  }),
}));

const topicCatalog: GesetzesgrundlageDocument = {
  topics: [
    {
      name: 'Nebenbestimmungen',
      description: '',
      showInMvp: false,
      showInEwm: false,
      showInBeschluss: false,
      pruefungsNorms: [],
      verfahrensNorms: [],
      subtopics: [],
    },
  ],
  stateNormGroups: {},
  topicStateGroups: {},
};

const node = (
  id: string,
  parent: string | null,
  title: string,
  patch: Partial<BeschlussNode> = {},
): BeschlussNode => ({
  id,
  parent_vae_node_id: parent,
  title,
  text: '',
  topic: null,
  order: 0,
  is_hidden: false,
  can_add_child: true,
  ...patch,
});

const makeUsecase = (beschluss: BeschlussDocument): Usecase => ({
  slug: 'fernstrasse',
  projekttyp: {
    id: '00000000-0000-0000-0000-000000000000',
    name: 'Fernstraße',
  },
  gesetzesgrundlage: topicCatalog,
  dokumente: { categories: [] } satisfies DokumenteDocument,
  beschluss,
  updatedAt: '2026-08-20T10:00:00.000Z',
});

const renderDraft = (usecase: Usecase) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  queryClient.setQueryData(catalogUsecaseQueryKey(usecase.projekttyp.id), {
    kind: 'ready',
    usecase,
  });
  const wrapper = (props: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, props.children);

  return render(<DecisionTemplateDraftSection usecase={usecase} />, {
    wrapper,
  });
};

const getSaveButton = () => {
  const [saveButton] = screen.getAllByRole('button', {
    name: 'catalog.save',
  });
  if (!saveButton) {
    throw new Error('Expected a save button to exist');
  }
  return saveButton;
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mocks.updateCatalogUsecase.mockReset();
  mocks.showMutationErrorToast.mockReset();
  mocks.updateCatalogUsecase.mockImplementation(
    (_usecaseId: string, body: Usecase) =>
      Promise.resolve({
        data: { ...body, updatedAt: '2026-08-20T10:01:00.000Z' },
      }),
  );
});

describe('DecisionTemplateDraftSection', () => {
  it('creates below a parent, hides create on locked parents, removes a subtree, and saves only beschluss', async () => {
    const user = userEvent.setup();
    const usecase = makeUsecase({
      nodes: [
        node('root', null, 'Root', { can_add_child: true, order: 0 }),
        node('locked', 'root', 'Locked', {
          can_add_child: false,
          order: 1,
        }),
        node('open', 'root', 'Open', { can_add_child: true, order: 2 }),
        node('child', 'open', 'Child', {
          can_add_child: false,
          order: 3,
        }),
      ],
    });
    renderDraft(usecase);

    await user.click(
      screen.getByRole('button', { name: 'decisionTemplate.expand:Root' }),
    );
    expect(
      screen.queryByRole('button', {
        name: 'decisionTemplate.addChildAria:Locked',
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'decisionTemplate.addChildAria:Open',
      }),
    );
    await user.type(
      within(screen.getByRole('dialog')).getByLabelText(
        'decisionTemplate.fields.title*',
      ),
      'New child',
    );
    await user.click(
      screen.getByRole('button', { name: 'decisionTemplate.dialogs.add' }),
    );
    await user.click(
      screen.getByRole('button', { name: 'decisionTemplate.expand:Open' }),
    );
    expect(screen.getByText('New child')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'decisionTemplate.removeNode:Open',
      }),
    );
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'actions.confirmDelete' }),
    );
    expect(screen.queryByText('Open')).not.toBeInTheDocument();
    expect(screen.queryByText('Child')).not.toBeInTheDocument();
    expect(screen.queryByText('New child')).not.toBeInTheDocument();

    await user.click(getSaveButton());
    await waitFor(() => {
      expect(mocks.updateCatalogUsecase).toHaveBeenCalledTimes(1);
    });

    const body = mocks.updateCatalogUsecase.mock.calls[0]?.[1] as {
      beschluss: BeschlussDocument;
      dokumente: unknown;
      gesetzesgrundlage: unknown;
      projekttyp: unknown;
    };
    expect(body.projekttyp).toEqual(usecase.projekttyp);
    expect(body.gesetzesgrundlage).toEqual(usecase.gesetzesgrundlage);
    expect(body.dokumente).toEqual(usecase.dokumente);
    expect(body.beschluss.nodes.map((item) => item.id)).toEqual([
      'root',
      'locked',
    ]);
    expect(
      body.beschluss.nodes.find((item) => item.id === 'locked')?.order,
    ).toBe(1);
  });

  it('preserves globally unique order values with up/down buttons', async () => {
    const user = userEvent.setup();
    const usecase = makeUsecase({
      nodes: [
        node('root', null, 'Root', { order: 0 }),
        node('a', 'root', 'Alpha', { order: 1 }),
        node('b', 'root', 'Beta', { order: 2 }),
      ],
    });
    renderDraft(usecase);
    await user.click(
      screen.getByRole('button', { name: 'decisionTemplate.expand:Root' }),
    );

    await user.click(
      screen.getByRole('button', { name: 'decisionTemplate.moveDown:Alpha' }),
    );
    await user.click(getSaveButton());
    await waitFor(() => {
      expect(mocks.updateCatalogUsecase).toHaveBeenCalledTimes(1);
    });

    const body = mocks.updateCatalogUsecase.mock.calls[0]?.[1] as {
      beschluss: BeschlussDocument;
    };
    const siblings = body.beschluss.nodes
      .filter((item) => item.parent_vae_node_id === 'root')
      .sort((left, right) => left.order - right.order);
    expect(siblings.map((item) => item.id)).toEqual(['b', 'a']);
    expect(siblings.map((item) => item.order)).toEqual([1, 2]);
    expect(new Set(body.beschluss.nodes.map((item) => item.order)).size).toBe(
      body.beschluss.nodes.length,
    );
  });

  it('blocks save when a node references an unknown topic', async () => {
    const user = userEvent.setup();
    const usecase = makeUsecase({
      nodes: [
        node('root', null, 'Root', {
          topic: 'Ghost',
          can_add_child: false,
        }),
      ],
    });
    renderDraft(usecase);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'decisionTemplate.errors.unknownTopic:Root:Ghost',
    );
    for (const saveButton of screen.getAllByRole('button', {
      name: 'catalog.save',
    })) {
      expect(saveButton).toBeDisabled();
    }

    await user.click(
      screen.getByRole('button', { name: 'decisionTemplate.expand:Root' }),
    );
    expect(
      screen.getByText('decisionTemplate.unknownTopicMarker'),
    ).toBeInTheDocument();
  });

  it('shows a title field error and disables save when the title is cleared', async () => {
    const user = userEvent.setup();
    const usecase = makeUsecase({
      nodes: [node('root', null, 'Root', { can_add_child: false })],
    });
    renderDraft(usecase);

    await user.click(
      screen.getByRole('button', { name: 'decisionTemplate.expand:Root' }),
    );
    const titleInput = screen.getByLabelText('decisionTemplate.fields.title*');
    await user.clear(titleInput);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'decisionTemplate.errors.titleRequired',
    );
    for (const saveButton of screen.getAllByRole('button', {
      name: 'catalog.save',
    })) {
      expect(saveButton).toBeDisabled();
    }
  });
});
