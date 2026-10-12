import { queryClient } from '@/integrations/tanstack-query/root-provider';
import { Route } from '@/routes/verfahren/$verfahrenId/fvp/route';
import type * as TanstackReactRouter from '@tanstack/react-router';
import { act, cleanup, render } from '@testing-library/react';
import type { ComponentType, PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const matching = vi.hoisted(() => ({ isLoading: true }));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof TanstackReactRouter>()),
  createFileRoute: () => (config: object) => ({
    ...config,
    useParams: () => ({ verfahrenId: 'project-1' }),
  }),
  Outlet: () => null,
}));

vi.mock('@/features/project/route-navbar/ProjectNavbar', () => ({
  ProjectNavbar: () => null,
}));

vi.mock(
  '@/features/workflow-runtime/workflow-status/FvpWorkflowContext',
  () => ({
    FvpWorkflowProvider: ({ children }: PropsWithChildren) => children,
    useFvpWorkflowContext: () => ({
      requiredDocumentsWorkflow: { isLoading: matching.isLoading },
      tableOfContentsWorkflow: { isLoading: false },
      plausibilityWorkflow: { isLoading: false },
    }),
  }),
);

const FvpLayout = (Route as unknown as { component: ComponentType }).component;
const documentList = ['formal-documents', 'project-1', 1, {}];
const documentSummary = ['formal-document-summary', 'project-1', 1];

const cacheDocumentReads = () => {
  queryClient.setQueryData(documentList, { pages: [[]], pageParams: [0] });
  queryClient.setQueryData(documentSummary, {});
};

const isStale = (queryKey: unknown[]) =>
  queryClient.getQueryState(queryKey)?.isInvalidated;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  queryClient.clear();
});

describe('FVP layout workflow refresh', () => {
  it('refreshes the document list and summary when LLM matching finishes', () => {
    matching.isLoading = true;
    const view = render(<FvpLayout />);
    cacheDocumentReads();

    matching.isLoading = false;
    view.rerender(<FvpLayout />);

    expect(isStale(documentList)).toBe(true);
    expect(isStale(documentSummary)).toBe(true);
  });

  it('keeps refreshing the document list and summary while LLM matching runs', () => {
    vi.useFakeTimers();
    matching.isLoading = true;
    render(<FvpLayout />);
    cacheDocumentReads();

    act(() => {
      vi.advanceTimersByTime(5_000);
    });

    expect(isStale(documentList)).toBe(true);
    expect(isStale(documentSummary)).toBe(true);
  });
});
