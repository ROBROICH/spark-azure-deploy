import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ProjectTypeDetailScreen } from './ProjectTypeDetailScreen';

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  projectType: {
    id: 'type-1',
    name: 'Fernstraße',
    active: true,
  },
  section: 'catalog' as 'catalog' | 'required-documents' | 'decision-template',
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) =>
      options?.name ? `${key}:${options.name}` : key,
  }),
}));

vi.mock('@/features/shared/config/productMode', () => ({
  getConfiguredProductMode: () => 'spark',
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ projectTypeId: mocks.projectType.id }),
    useLoaderData: () => mocks.projectType,
    useNavigate: () => mocks.navigate,
    useSearch: (options?: {
      select?: (search: { section: typeof mocks.section }) => unknown;
    }) =>
      options?.select
        ? options.select({ section: mocks.section })
        : { section: mocks.section },
  }),
  useBlocker: () => ({
    status: 'idle',
    proceed: undefined,
    reset: undefined,
  }),
  Link: (props: { children: ReactNode; to: string }) => (
    <a href={props.to}>{props.children}</a>
  ),
}));

vi.mock('../catalog/CatalogSection', () => ({
  CatalogSection: (props: { projectTypeId: string }) => (
    <div>catalog:{props.projectTypeId}</div>
  ),
}));

vi.mock('../required-documents/RequiredDocumentsSection', () => ({
  RequiredDocumentsSection: () => <div>required-documents</div>,
}));

vi.mock('../decision-template/DecisionTemplateSection', () => ({
  DecisionTemplateSection: () => <div>decision-template</div>,
}));

vi.mock('../export/CatalogExportButton', () => ({
  CatalogExportButton: () => null,
}));

afterEach(() => {
  cleanup();
  document.title = '';
  mocks.section = 'catalog';
});

beforeEach(() => {
  mocks.navigate.mockReset();
  mocks.navigate.mockResolvedValue(undefined);
});

describe('ProjectTypeDetailScreen', () => {
  it('renders the selected project-type heading and editor tabs', () => {
    render(<ProjectTypeDetailScreen />);

    expect(
      screen.getByRole('heading', {
        name: 'projectTypes.detail.heading:Fernstraße',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'catalog.title' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'requiredDocuments.title' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('tab', { name: 'decisionTemplate.title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('catalog:type-1')).toBeInTheDocument();
  });

  it('links back to the project-type selection', () => {
    render(<ProjectTypeDetailScreen />);

    expect(
      screen.getByRole('link', { name: 'projectTypes.detail.back' }),
    ).toHaveAttribute('href', '/administration');
  });

  it('stores the active editor section on the detail route', async () => {
    const user = userEvent.setup();
    render(<ProjectTypeDetailScreen />);

    await user.click(
      screen.getByRole('tab', { name: 'requiredDocuments.title' }),
    );

    expect(mocks.navigate).toHaveBeenCalledWith({
      search: expect.any(Function),
      replace: true,
      resetScroll: false,
    });
    const searchUpdate = mocks.navigate.mock.calls[0]?.[0]
      ?.search as (previous: { section: string }) => { section: string };
    expect(searchUpdate({ section: 'catalog' })).toEqual({
      section: 'required-documents',
    });
  });
});
