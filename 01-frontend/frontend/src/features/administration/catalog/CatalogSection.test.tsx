import '@testing-library/jest-dom/vitest';
import { attachHttpStatusToError } from '@/integrations/api-clients/httpErrorStatus';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import beschlussFixture from '../data/catalog-mock/fixtures/beschluss.json';
import gesetzesgrundlageFixture from '../data/catalog-mock/fixtures/gesetzesgrundlage.json';
import type {
  BeschlussDocument,
  CatalogTopic,
  GesetzesgrundlageDocument,
  Usecase,
} from '../data/usecaseApi';
import {
  AdministrationEditorRegistrationProvider,
  type AdministrationEditor,
} from '../editor-navigation/AdministrationEditorRegistration';
import { CatalogDraftSection } from './CatalogDraftSection';
import { CatalogSection } from './CatalogSection';
import { catalogUsecaseQueryKey } from './usecaseQueries';

const mocks = vi.hoisted(() => ({
  createCatalogUsecase: vi.fn(),
  getCatalogUsecase: vi.fn(),
  updateCatalogUsecase: vi.fn(),
  useLiveQuery: vi.fn(),
  showMutationErrorToast: vi.fn((_options?: unknown) => true),
}));

vi.mock('@/api-clients/backend/sdk.gen', () => ({}));

vi.mock('@/api-clients/backend', () => ({
  v1ExaminationGetLegalBasisNorms: vi.fn(),
}));

vi.mock('../data/usecaseApi', () => ({
  createCatalogUsecase: (...args: unknown[]) =>
    mocks.createCatalogUsecase(...args),
  getCatalogUsecase: (...args: unknown[]) => mocks.getCatalogUsecase(...args),
  updateCatalogUsecase: (...args: unknown[]) =>
    mocks.updateCatalogUsecase(...args),
}));

vi.mock('@tanstack/react-db', () => ({
  useLiveQuery: (...args: unknown[]) => mocks.useLiveQuery(...args),
}));

vi.mock(
  '@/features/project/data/project-types/projectTypes.collection',
  () => ({
    projectTypesCollection: { utils: { refetch: vi.fn() } },
  }),
);

vi.mock('@/integrations/api-clients/mutationErrorToast', () => ({
  showMutationErrorToast: (options: unknown) =>
    mocks.showMutationErrorToast(options),
  isMutationToastHandledError: () => false,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string; nodes?: string }) => {
      if (options?.name && options.nodes) {
        return `${key}:${options.name}:${options.nodes}`;
      }
      if (options?.name) {
        return `${key}:${options.name}`;
      }
      return key;
    },
  }),
}));

const projectType = {
  id: '00000000-0000-0000-0000-000000000000',
  name: 'Fernstraße',
  active: true,
};

const smallGesetzesgrundlage: GesetzesgrundlageDocument = {
  topics: (gesetzesgrundlageFixture as GesetzesgrundlageDocument).topics.slice(
    0,
    2,
  ),
  stateNormGroups: {},
  topicStateGroups: {},
};

const usecase: Usecase = {
  slug: 'fernstrasse',
  projekttyp: { id: projectType.id, name: projectType.name },
  gesetzesgrundlage: smallGesetzesgrundlage,
  dokumente: { categories: [] },
  beschluss: beschlussFixture as BeschlussDocument,
  updatedAt: '2026-08-20T10:00:00.000Z',
};

const createDeferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

const renderWithClient = (
  ui: ReactNode,
  queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  }),
) => {
  const wrapper = (props: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, props.children);

  return { ...render(ui, { wrapper }), queryClient };
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

const getDiscardButton = () => {
  const [discardButton] = screen.getAllByRole('button', {
    name: 'catalog.discard',
  });
  if (!discardButton) {
    throw new Error('Expected a discard button to exist');
  }
  return discardButton;
};

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  mocks.createCatalogUsecase.mockReset();
  mocks.getCatalogUsecase.mockReset();
  mocks.updateCatalogUsecase.mockReset();
  mocks.useLiveQuery.mockReset();
  mocks.showMutationErrorToast.mockReset();
  mocks.useLiveQuery.mockReturnValue({
    data: [projectType],
    isLoading: false,
    isError: false,
  });
});

describe('CatalogSection', () => {
  it('shows a loading status while the catalog query is pending', () => {
    mocks.getCatalogUsecase.mockReturnValue(new Promise(() => undefined));

    renderWithClient(<CatalogSection projectTypeId={projectType.id} />);

    expect(
      screen.getByRole('status', { name: 'catalog.loading' }),
    ).toBeInTheDocument();
  });

  it('shows a query error with retry', async () => {
    const user = userEvent.setup();
    mocks.getCatalogUsecase.mockRejectedValue(new Error('catalog down'));

    renderWithClient(<CatalogSection projectTypeId={projectType.id} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('catalog down');
    await user.click(screen.getByRole('button', { name: 'catalog.retry' }));

    await waitFor(() => {
      expect(mocks.getCatalogUsecase).toHaveBeenCalledTimes(2);
    });
  });

  it('shows the init card on 404 and creates an empty catalog', async () => {
    const user = userEvent.setup();
    mocks.getCatalogUsecase.mockRejectedValue(
      attachHttpStatusToError(
        { message: 'not found' },
        new Response(null, { status: 404 }),
      ),
    );
    mocks.createCatalogUsecase.mockResolvedValue({ data: usecase });

    renderWithClient(<CatalogSection projectTypeId={projectType.id} />);

    expect(
      await screen.findByRole('heading', { name: 'catalog.init.title' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`catalog.init.description:${projectType.name}`),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'catalog.init.createButton' }),
    );

    await waitFor(() => {
      expect(mocks.createCatalogUsecase).toHaveBeenCalledTimes(1);
    });

    const body = mocks.createCatalogUsecase.mock.calls[0]?.[0] as {
      projekttyp: { id: string; name: string };
      gesetzesgrundlage: unknown;
      dokumente: unknown;
      beschluss: { nodes: { title: string; parent_vae_node_id: null }[] };
    };

    expect(body.projekttyp).toEqual({
      id: projectType.id,
      name: projectType.name,
    });
    expect(body.gesetzesgrundlage).toEqual({
      topics: [],
      stateNormGroups: {},
      topicStateGroups: {},
    });
    expect(body.dokumente).toEqual({ categories: [] });
    expect(body.beschluss.nodes).toHaveLength(1);
    expect(body.beschluss.nodes[0]).toMatchObject({
      parent_vae_node_id: null,
      title: 'Beschluss',
      text: '',
      topic: null,
      order: 0,
      is_hidden: false,
      can_add_child: true,
    });
  });
});

describe('CatalogDraftSection save flow', () => {
  it('settles the draft cleanly after a successful save and refetch', async () => {
    const user = userEvent.setup();
    const savedUsecase = {
      ...usecase,
      gesetzesgrundlage: {
        ...usecase.gesetzesgrundlage,
        topics: usecase.gesetzesgrundlage.topics.map((topic, index) =>
          index === 0 ? { ...topic, showInMvp: true } : topic,
        ),
      },
      updatedAt: '2026-08-20T10:01:00.000Z',
    };
    mocks.getCatalogUsecase
      .mockResolvedValueOnce({ data: usecase })
      .mockResolvedValueOnce({ data: savedUsecase });
    mocks.updateCatalogUsecase.mockResolvedValue({ data: savedUsecase });

    renderWithClient(<CatalogSection projectTypeId={projectType.id} />);

    await user.click(
      await screen.findByRole('button', { name: 'Sonstiges / Kein Thema' }),
    );
    const visibilityToggle = await screen.findByRole('switch', {
      name: 'catalog.fields.showInMvp',
    });
    await user.click(visibilityToggle);
    expect(screen.getByText('catalog.dirty')).toBeInTheDocument();

    await user.click(getSaveButton());

    await waitFor(() => {
      expect(mocks.getCatalogUsecase).toHaveBeenCalledTimes(2);
      expect(screen.queryByText('catalog.dirty')).not.toBeInTheDocument();
    });
    expect(visibilityToggle).toBeChecked();
  });

  it('disables save while the PUT is in flight and keeps the draft on error', async () => {
    const user = userEvent.setup();
    const deferred = createDeferred<{ data: Usecase }>();
    mocks.updateCatalogUsecase.mockReturnValue(deferred.promise);

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(catalogUsecaseQueryKey(projectType.id), {
      kind: 'ready',
      usecase,
    });

    renderWithClient(<CatalogDraftSection usecase={usecase} />, queryClient);

    await user.click(
      screen.getByRole('button', { name: 'Sonstiges / Kein Thema' }),
    );
    const visibilityToggle = await screen.findByRole('switch', {
      name: 'catalog.fields.showInMvp',
    });
    await user.click(visibilityToggle);

    const saveButton = getSaveButton();
    expect(saveButton).toBeEnabled();
    await user.click(saveButton);

    expect(saveButton).toBeDisabled();
    expect(mocks.updateCatalogUsecase).toHaveBeenCalledTimes(1);

    const failure = new Error('save failed');
    deferred.reject(failure);

    expect(await screen.findByRole('alert')).toHaveTextContent('save failed');
    expect(visibilityToggle).toBeChecked();
    expect(mocks.showMutationErrorToast).toHaveBeenCalledWith(
      expect.objectContaining({
        error: failure,
        fallbackMessage: 'catalog.toasts.saveError',
      }),
    );
  });

  it('preserves the dirty draft after a save conflict and discards to the newest server baseline', async () => {
    const user = userEvent.setup();
    const registeredEditor = { current: null as AdministrationEditor | null };
    const registerEditor = (editor: AdministrationEditor) => {
      registeredEditor.current = editor;
      return () => {
        if (registeredEditor.current === editor) {
          registeredEditor.current = null;
        }
      };
    };
    const getRegisteredEditor = () => {
      if (!registeredEditor.current) {
        throw new Error('Expected the catalog editor to be registered');
      }
      return registeredEditor.current;
    };
    const reloadedUsecase = {
      ...usecase,
      gesetzesgrundlage: {
        ...usecase.gesetzesgrundlage,
        topics: usecase.gesetzesgrundlage.topics.map((topic, index) =>
          index === 0 ? { ...topic, name: 'Extern umbenannt' } : topic,
        ),
      },
      updatedAt: '2026-08-20T10:01:00.000Z',
    };
    mocks.getCatalogUsecase
      .mockResolvedValueOnce({ data: usecase })
      .mockResolvedValue({ data: reloadedUsecase });
    mocks.updateCatalogUsecase.mockRejectedValue(
      attachHttpStatusToError(
        new Error('Catalog usecase was modified by another request'),
        new Response(null, { status: 409 }),
      ),
    );

    renderWithClient(
      <AdministrationEditorRegistrationProvider value={registerEditor}>
        <CatalogSection projectTypeId={projectType.id} />
      </AdministrationEditorRegistrationProvider>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Sonstiges / Kein Thema' }),
    );
    const visibilityToggle = await screen.findByRole('switch', {
      name: 'catalog.fields.showInMvp',
    });
    await user.click(visibilityToggle);
    expect(screen.getByText('catalog.dirty')).toBeInTheDocument();

    await waitFor(() => {
      expect(getRegisteredEditor().dirty).toBe(true);
    });
    let saved = true;
    await act(async () => {
      saved = await getRegisteredEditor().save();
    });

    expect(saved).toBe(false);
    await waitFor(() => {
      expect(mocks.getCatalogUsecase).toHaveBeenCalledTimes(2);
      expect(screen.getByText('catalog.dirty')).toBeInTheDocument();
    });
    expect(visibilityToggle).toBeChecked();
    expect(
      screen.getByRole('button', { name: 'Sonstiges / Kein Thema' }),
    ).toBeInTheDocument();
    expect(mocks.showMutationErrorToast).toHaveBeenCalledWith(
      expect.objectContaining({
        statusMessages: expect.objectContaining({
          409: 'catalog.toasts.saveConflict',
        }),
      }),
    );

    await act(async () => {
      saved = await getRegisteredEditor().save();
    });

    expect(saved).toBe(false);
    expect(mocks.updateCatalogUsecase).toHaveBeenCalledTimes(2);
    for (const [, body] of mocks.updateCatalogUsecase.mock.calls) {
      expect(body).toEqual(
        expect.objectContaining({ updatedAt: usecase.updatedAt }),
      );
      expect(body.gesetzesgrundlage.topics[0].name).toBe(
        usecase.gesetzesgrundlage.topics[0]?.name,
      );
    }

    await user.click(getDiscardButton());

    expect(
      screen.getByRole('button', { name: 'Extern umbenannt' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('catalog.dirty')).not.toBeInTheDocument();
  });
});

const editorTopic: CatalogTopic = {
  name: 'Waldschutz',
  description: '',
  showInMvp: false,
  showInEwm: false,
  showInBeschluss: false,
  pruefungsNorms: [],
  verfahrensNorms: [],
  subtopics: [],
};

const editorUsecase: Usecase = {
  slug: 'fernstrasse',
  projekttyp: { id: projectType.id, name: projectType.name },
  gesetzesgrundlage: {
    topics: [editorTopic],
    stateNormGroups: {},
    topicStateGroups: {},
  },
  dokumente: { categories: [] },
  beschluss: { nodes: [] },
  updatedAt: '2026-08-20T10:00:00.000Z',
};

const renderDraft = (
  gesetzesgrundlage: GesetzesgrundlageDocument = editorUsecase.gesetzesgrundlage,
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const draftUsecase = {
    ...editorUsecase,
    gesetzesgrundlage,
  };
  queryClient.setQueryData(catalogUsecaseQueryKey(projectType.id), {
    kind: 'ready',
    usecase: draftUsecase,
  });
  return renderWithClient(
    <CatalogDraftSection usecase={draftUsecase} />,
    queryClient,
  );
};

describe('CatalogDraftSection editors', () => {
  it('adds a topic and shows a duplicate-name alert', async () => {
    const user = userEvent.setup();
    renderDraft();

    await user.click(
      screen.getByRole('button', { name: 'catalog.topics.add' }),
    );
    await user.type(
      within(screen.getByRole('dialog')).getByLabelText('catalog.fields.name*'),
      'Neues Thema',
    );
    await user.click(
      screen.getByRole('button', { name: 'catalog.dialogs.add' }),
    );
    expect(
      screen.getByRole('button', { name: 'Neues Thema' }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'catalog.topics.add' }),
    );
    await user.type(
      within(screen.getByRole('dialog')).getByLabelText('catalog.fields.name*'),
      'Waldschutz',
    );
    await user.click(
      screen.getByRole('button', { name: 'catalog.dialogs.add' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'catalog.errors.duplicateTopicName:Waldschutz',
    );
    expect(screen.getAllByRole('button', { name: 'Waldschutz' })).toHaveLength(
      1,
    );
  });

  it('adds a subtopic and keeps federal selection on the subtopic row', async () => {
    const user = userEvent.setup();
    renderDraft();

    await user.click(screen.getByRole('button', { name: 'Waldschutz' }));
    await user.click(
      screen.getByRole('button', { name: 'catalog.subtopics.add' }),
    );
    await user.type(
      within(screen.getByRole('dialog')).getByLabelText('catalog.fields.name*'),
      'Boden',
    );
    await user.click(
      screen.getByRole('button', { name: 'catalog.dialogs.add' }),
    );
    expect(screen.getByRole('button', { name: 'Boden' })).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'catalog.legalBasis.federalActionAria:Boden',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {
        name: 'catalog.legalBasis.stateActionAria:Boden',
      }),
    ).toBeNull();
    expect(screen.queryByRole('textbox', { name: /jurabk/i })).toBeNull();
  });

  it('keeps all topic actions in the row and expands text editing only from the topic trigger', async () => {
    const user = userEvent.setup();
    renderDraft();

    const topicTrigger = screen.getByRole('button', { name: 'Waldschutz' });
    const topicItem = topicTrigger.closest<HTMLElement>(
      '[data-slot="accordion-item"]',
    );
    if (!topicItem) {
      throw new Error('Expected the topic accordion item to exist');
    }

    expect(
      within(topicItem).getByRole('button', {
        name: 'catalog.legalBasis.federalActionAria:Waldschutz',
      }),
    ).toBeInTheDocument();
    expect(
      within(topicItem).getByRole('button', {
        name: 'catalog.legalBasis.stateActionAria:Waldschutz',
      }),
    ).toBeInTheDocument();
    expect(
      within(topicItem).getByRole('button', {
        name: 'catalog.topics.remove:Waldschutz',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('switch', { name: 'catalog.fields.showInMvp' }),
    ).toBeNull();

    await user.click(
      within(topicItem).getByRole('button', {
        name: 'catalog.legalBasis.stateActionAria:Waldschutz',
      }),
    );

    expect(
      screen.queryByRole('switch', { name: 'catalog.fields.showInMvp' }),
    ).toBeNull();

    await user.keyboard('{Escape}');
    await user.click(topicTrigger);

    expect(
      screen.getByRole('switch', { name: 'catalog.fields.showInMvp' }),
    ).toBeInTheDocument();
    expect(
      within(topicItem).getAllByRole('button', {
        name: 'catalog.topics.remove:Waldschutz',
      }),
    ).toHaveLength(1);
    expect(screen.queryByText('catalog.stateGroups.title')).toBeNull();
    expect(screen.queryByText('catalog.stateGroups.empty')).toBeNull();
  });

  it('requires an in-button confirmation before removing a topic', async () => {
    const user = userEvent.setup();
    renderDraft();

    await user.click(
      screen.getByRole('button', {
        name: 'catalog.topics.remove:Waldschutz',
      }),
    );

    expect(
      screen.getByRole('button', { name: 'Waldschutz' }),
    ).toBeInTheDocument();
    const confirmButton = screen.getByRole('button', {
      name: 'actions.confirmDelete',
    });
    expect(confirmButton).toHaveClass('bg-error-800');

    await user.click(confirmButton);

    expect(
      screen.queryByRole('button', { name: 'Waldschutz' }),
    ).not.toBeInTheDocument();
  });

  it('saves topic metadata without rewriting legacy state-norm groups', async () => {
    const user = userEvent.setup();
    const duplicateNorm = {
      jurabk: 'BauGB',
      paragraphNr: '38',
      absatz: null,
      satz: null,
      nummer: null,
    };
    const legacyGroups = { 'DSchG|Baden-Württemberg': [] };

    renderDraft({
      topics: [
        {
          ...editorTopic,
          pruefungsNorms: [duplicateNorm, duplicateNorm],
        },
      ],
      stateNormGroups: legacyGroups,
      topicStateGroups: { Waldschutz: ['DSchG'] },
    });

    await user.click(screen.getByRole('button', { name: 'Waldschutz' }));
    await user.click(
      screen.getByRole('switch', { name: 'catalog.fields.showInMvp' }),
    );

    expect(screen.getByText('catalog.dirty')).toBeInTheDocument();
    await user.click(getSaveButton());

    await waitFor(() => {
      expect(mocks.updateCatalogUsecase).toHaveBeenCalledTimes(1);
    });
    expect(mocks.updateCatalogUsecase.mock.calls[0]?.[1]).toMatchObject({
      gesetzesgrundlage: {
        stateNormGroups: legacyGroups,
        topicStateGroups: { Waldschutz: ['DSchG'] },
      },
    });
  });
});
