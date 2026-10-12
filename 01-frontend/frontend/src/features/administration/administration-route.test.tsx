import { describe, expect, it, vi } from 'vitest';
import { Route as AdministrationIndexRoute } from '@/routes/administration/index';
import { Route as AdministrationDetailRoute } from '@/routes/administration/$projectTypeId';

type RouteAccess = {
  beforeLoad: (args: {
    context: {
      queryClient: {
        fetchQuery: (options: unknown) => Promise<{ role: string }>;
      };
    };
  }) => Promise<void>;
};

const administrationIndexRoute =
  AdministrationIndexRoute as unknown as RouteAccess;
const administrationDetailRoute =
  AdministrationDetailRoute as unknown as RouteAccess & {
    validateSearch: {
      parse: (value: unknown) => { section: string };
    };
    loader: (args: { params: { projectTypeId: string } }) => Promise<unknown>;
  };

vi.mock('@tanstack/react-router', () => ({
  createFileRoute: () => (config: unknown) => config,
  notFound: () => new Error('Not Found'),
}));

vi.mock('@/features/administration/AdministrationScreen', () => ({
  AdministrationScreen: () => null,
}));

vi.mock(
  '@/features/administration/project-type-detail-screen/ProjectTypeDetailScreen',
  () => ({
    ProjectTypeDetailScreen: () => null,
  }),
);

const mocks = vi.hoisted(() => ({
  loadAdministrationProjectType: vi.fn(),
}));

vi.mock(
  '@/features/administration/route/loadAdministrationProjectType',
  () => ({
    loadAdministrationProjectType: (...args: unknown[]) =>
      mocks.loadAdministrationProjectType(...args),
  }),
);

describe('/administration/ route', () => {
  it('does not keep editor search on the overview', () => {
    expect('validateSearch' in (AdministrationIndexRoute as object)).toBe(
      false,
    );
  });

  it('allows direct access for admins', async () => {
    const fetchQuery = vi.fn().mockResolvedValue({ role: 'admin' });

    await expect(
      administrationIndexRoute.beforeLoad({
        context: { queryClient: { fetchQuery } },
      }),
    ).resolves.toBeUndefined();
  });

  it('rejects direct access for regular users', async () => {
    const fetchQuery = vi.fn().mockResolvedValue({ role: 'user' });

    await expect(
      administrationIndexRoute.beforeLoad({
        context: { queryClient: { fetchQuery } },
      }),
    ).rejects.toThrow('Not Found');
  });
});

describe('/administration/$projectTypeId route', () => {
  it('keeps a valid editor section and falls back to the catalog', () => {
    expect(
      administrationDetailRoute.validateSearch.parse({
        section: 'required-documents',
      }),
    ).toEqual({
      section: 'required-documents',
    });
    expect(
      administrationDetailRoute.validateSearch.parse({ section: 'invalid' }),
    ).toEqual({ section: 'catalog' });
  });

  it('loads the selected project type', async () => {
    mocks.loadAdministrationProjectType.mockResolvedValue({
      id: 'type-1',
      name: 'Fernstraße',
      active: true,
    });

    await expect(
      administrationDetailRoute.loader({
        params: { projectTypeId: 'type-1' },
      }),
    ).resolves.toEqual({
      id: 'type-1',
      name: 'Fernstraße',
      active: true,
    });
  });

  it('rejects direct access for regular users', async () => {
    const fetchQuery = vi.fn().mockResolvedValue({ role: 'user' });

    await expect(
      administrationDetailRoute.beforeLoad({
        context: { queryClient: { fetchQuery } },
      }),
    ).rejects.toThrow('Not Found');
  });
});
