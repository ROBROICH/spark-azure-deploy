import '@testing-library/jest-dom/vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import beschlussFixture from '../data/catalog-mock/fixtures/beschluss.json';
import gesetzesgrundlageFixture from '../data/catalog-mock/fixtures/gesetzesgrundlage.json';
import type {
  BeschlussDocument,
  DokumenteDocument,
  GesetzesgrundlageDocument,
  Usecase,
} from '../data/usecaseApi';
import { catalogUsecaseQueryKey } from '../catalog/usecaseQueries';
import { RequiredDocumentsDraftSection } from './RequiredDocumentsDraftSection';

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
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));

const smallDokumente: DokumenteDocument = {
  categories: [
    {
      id: '00000000-0000-0000-0000-000000000001',
      category: 'Teil A',
      document_types: [
        {
          id: '00000000-0000-0000-0000-000000000002',
          name: 'Lageplan',
          description: 'Plan',
          expected_count: 1,
        },
      ],
    },
  ],
};

const usecase: Usecase = {
  slug: 'fernstrasse',
  projekttyp: {
    id: '00000000-0000-0000-0000-000000000000',
    name: 'Fernstraße',
  },
  gesetzesgrundlage: {
    topics: (
      gesetzesgrundlageFixture as GesetzesgrundlageDocument
    ).topics.slice(0, 1),
    stateNormGroups: {},
    topicStateGroups: {},
  },
  dokumente: smallDokumente,
  beschluss: beschlussFixture as BeschlussDocument,
  updatedAt: '2026-08-20T10:00:00.000Z',
};

const renderDraft = () => {
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

  return render(<RequiredDocumentsDraftSection usecase={usecase} />, {
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

const expandCategory = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Teil A' }));
};

describe('RequiredDocumentsDraftSection', () => {
  it('adds, renames, and removes a category', async () => {
    const user = userEvent.setup();
    renderDraft();

    await user.click(
      screen.getByRole('button', { name: 'requiredDocuments.addCategory' }),
    );
    await user.type(
      screen.getByLabelText('requiredDocuments.fields.categoryName*'),
      'Teil Z',
    );
    await user.click(
      screen.getByRole('button', { name: 'requiredDocuments.dialogs.add' }),
    );
    expect(screen.getByRole('button', { name: 'Teil Z' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Teil Z' }));
    await user.click(
      screen.getByRole('button', {
        name: 'requiredDocuments.renameCategoryAria:Teil Z',
      }),
    );
    const renameInput = screen.getByLabelText(
      'requiredDocuments.fields.categoryName*',
    );
    await user.clear(renameInput);
    await user.type(renameInput, 'Teil Y');
    await user.click(
      screen.getByRole('button', { name: 'requiredDocuments.dialogs.save' }),
    );
    expect(screen.getByRole('button', { name: 'Teil Y' })).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'requiredDocuments.removeCategory:Teil Y',
      }),
    );
    expect(screen.getByRole('button', { name: 'Teil Y' })).toBeInTheDocument();
    await user.click(
      screen.getByRole('button', { name: 'actions.confirmDelete' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Teil Y' }),
    ).not.toBeInTheDocument();
  });

  it('shows a conflict when a document type name is duplicated in the category', async () => {
    const user = userEvent.setup();
    renderDraft();
    await expandCategory(user);

    await user.click(
      screen.getByRole('button', {
        name: 'requiredDocuments.addDocumentType',
      }),
    );
    await user.type(screen.getByLabelText('catalog.fields.name*'), 'Lageplan');
    await user.click(
      screen.getByRole('button', { name: 'requiredDocuments.dialogs.add' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'requiredDocuments.errors.duplicateDocumentTypeName:Lageplan',
    );
    expect(screen.getAllByRole('button', { name: 'Lageplan' })).toHaveLength(1);
  });

  it('confirms removal from the named document-type header without expanding it', async () => {
    const user = userEvent.setup();
    renderDraft();
    await expandCategory(user);

    await user.click(
      screen.getByRole('button', {
        name: 'requiredDocuments.addDocumentType',
      }),
    );
    await user.type(screen.getByLabelText('catalog.fields.name*'), 'Höhenplan');
    await user.click(
      screen.getByRole('button', { name: 'requiredDocuments.dialogs.add' }),
    );

    expect(
      screen.getByRole('button', {
        name: 'requiredDocuments.removeDocumentType:Lageplan',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'requiredDocuments.removeDocumentType:Höhenplan',
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('catalog.fields.description'),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', {
        name: 'requiredDocuments.removeDocumentType:Höhenplan',
      }),
    );
    expect(
      screen.getByRole('button', { name: 'actions.confirmDelete' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Höhenplan' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText('catalog.fields.description'),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'actions.confirmDelete' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Höhenplan' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Lageplan' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: 'requiredDocuments.removeDocumentType:Lageplan',
      }),
    ).toBeInTheDocument();
  });

  it('keeps one named document-type remove on the header while expanded', async () => {
    const user = userEvent.setup();
    renderDraft();
    await expandCategory(user);
    await user.click(screen.getByRole('button', { name: 'Lageplan' }));

    expect(
      screen.getByLabelText('catalog.fields.description'),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', {
        name: 'requiredDocuments.removeDocumentType:Lageplan',
      }),
    ).toHaveLength(1);

    await user.click(
      screen.getByRole('button', {
        name: 'requiredDocuments.removeDocumentType:Lageplan',
      }),
    );
    expect(
      screen.getByRole('button', { name: 'actions.confirmDelete' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('adds, edits, and removes a document type', async () => {
    const user = userEvent.setup();
    renderDraft();
    await expandCategory(user);

    await user.click(
      screen.getByRole('button', {
        name: 'requiredDocuments.addDocumentType',
      }),
    );
    await user.type(screen.getByLabelText('catalog.fields.name*'), 'Höhenplan');
    await user.click(
      screen.getByRole('button', { name: 'requiredDocuments.dialogs.add' }),
    );
    await user.click(screen.getByRole('button', { name: 'Höhenplan' }));

    const description = screen.getByLabelText('catalog.fields.description');
    await user.clear(description);
    await user.type(description, 'Profil');
    expect(description).toHaveValue('Profil');

    await user.click(
      screen.getByRole('button', {
        name: 'requiredDocuments.removeDocumentType:Höhenplan',
      }),
    );
    await user.click(
      screen.getByRole('button', { name: 'actions.confirmDelete' }),
    );
    expect(
      screen.queryByRole('button', { name: 'Höhenplan' }),
    ).not.toBeInTheDocument();
  });

  it('saves only the dokumente slice and writes empty expected count as null', async () => {
    const user = userEvent.setup();
    renderDraft();
    await expandCategory(user);
    await user.click(screen.getByRole('button', { name: 'Lageplan' }));

    const countInput = screen.getByLabelText(
      'requiredDocuments.fields.expectedCount',
    );
    await user.clear(countInput);
    expect(countInput).toHaveValue('');

    await user.click(getSaveButton());
    await waitFor(() => {
      expect(mocks.updateCatalogUsecase).toHaveBeenCalledTimes(1);
    });

    const body = mocks.updateCatalogUsecase.mock.calls[0]?.[1] as {
      dokumente: DokumenteDocument;
      gesetzesgrundlage: unknown;
      beschluss: unknown;
      projekttyp: unknown;
      slug: string;
    };
    expect(body.slug).toBe('fernstrasse');
    expect(body.projekttyp).toEqual(usecase.projekttyp);
    expect(body.gesetzesgrundlage).toEqual(usecase.gesetzesgrundlage);
    expect(body.beschluss).toEqual(usecase.beschluss);
    expect(body.dokumente.categories[0]?.document_types[0]).toEqual({
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Lageplan',
      description: 'Plan',
      expected_count: null,
    });
  });

  it('shows a name field error when a document type name is cleared', async () => {
    const user = userEvent.setup();
    renderDraft();
    await expandCategory(user);
    await user.click(screen.getByRole('button', { name: 'Lageplan' }));

    const nameInput = screen.getByLabelText('catalog.fields.name*');
    await user.clear(nameInput);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'requiredDocuments.errors.emptyDocumentTypeName',
    );
    for (const saveButton of screen.getAllByRole('button', {
      name: 'catalog.save',
    })) {
      expect(saveButton).toBeDisabled();
    }
  });
});
