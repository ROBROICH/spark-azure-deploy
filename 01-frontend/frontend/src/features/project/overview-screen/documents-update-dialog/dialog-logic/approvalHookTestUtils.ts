import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { vi } from 'vitest';

const approvalFeedbackTestMocks = vi.hoisted(() => ({
  captureException: vi.fn(),
  toastError: vi.fn(),
}));

export const getApprovalFeedbackTestMocks = () => approvalFeedbackTestMocks;

export const resetApprovalFeedbackTestMocks = () => {
  approvalFeedbackTestMocks.captureException.mockReset();
  approvalFeedbackTestMocks.toastError.mockReset();
};

export const createApprovalTestQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

export const makeApprovalTestQueryWrapper = (
  queryClient = createApprovalTestQueryClient(),
) =>
  function ApprovalTestQueryWrapper(props: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      props.children,
    );
  };

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { error: approvalFeedbackTestMocks.toastError },
}));

vi.mock('@sentry/react', () => ({
  captureException: approvalFeedbackTestMocks.captureException,
}));
