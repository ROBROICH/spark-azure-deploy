import '@testing-library/jest-dom/vitest';
import {
  buildProjectNodeIndex,
  hasNode,
} from '@/db/nodes/examinationGraphModel';
import type { NodeSummary } from '@/db/nodes/types';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedbackNodeDialog } from './FeedbackNodeDialog';

const mocks = vi.hoisted(() => ({
  insertMock: vi.fn(),
  transactMock: vi.fn((callback: () => void) => {
    callback();
    const promise = mocks.persistShouldReject
      ? Promise.reject(new Error('persist failed'))
      : Promise.resolve();
    return { isPersisted: { promise } };
  }),
  persistShouldReject: false,
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  canMutateProject: true,
  useGraphMock: vi.fn(),
  useNodeMock: vi.fn(),
  toastErrorMock: vi.fn(),
  sentryCaptureMock: vi.fn(),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: { error: mocks.toastErrorMock },
}));

vi.mock('@sentry/react', () => ({
  captureException: mocks.sentryCaptureMock,
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ verfahrenId: 'project-1' }),
  }),
}));

vi.mock('@/features/access-control/current-user/CurrentUserProvider', () => ({
  useCurrentUser: () => ({ userId: 'user-1' }),
}));

vi.mock(
  '@/features/access-control/project-permissions/useCanMutateProject',
  () => ({
    useCanMutateProject: () => ({
      canMutateProject: mocks.canMutateProject,
    }),
  }),
);

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    delete: mocks.deleteMock,
    insert: mocks.insertMock,
    transact: mocks.transactMock,
    update: mocks.updateMock,
  }),
}));

vi.mock('@/db/nodes/hooks/useGraph', () => ({
  useGraph: mocks.useGraphMock,
}));

vi.mock('@/db/nodes/hooks/useNodes', () => ({
  useNode: mocks.useNodeMock,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'FeedbackDialog.cancel': 'Abbrechen',
        'FeedbackDialog.confirmDelete': 'Bestätigen?',
        'FeedbackDialog.delete': 'Feedback löschen',
        'FeedbackDialog.errors.deleteFailed':
          'Feedback konnte nicht gelöscht werden.',
        'FeedbackDialog.errors.saveFailed':
          'Feedback konnte nicht gespeichert werden.',
        'FeedbackDialog.feedbackLabel': 'Feedback',
        'FeedbackDialog.feedbackPlaceholder': 'Feedbackinhalt',
        'FeedbackDialog.feedbackVisibilityNote': 'Andere sehen Feedback.',
        'FeedbackDialog.loadingDescription': 'Feedback wird geladen.',
        'FeedbackDialog.qualityQuestion': 'Wie bewerten Sie das KI-Ergebnis?',
        'FeedbackDialog.ratingQuestion': 'Sind Sie zufrieden?',
        'FeedbackDialog.reason.RESULT_CORRECT': 'Ergebnis ist korrekt',
        'FeedbackDialog.save': 'Speichern',
        'FeedbackDialog.title': 'Feedback',
        'FeedbackDialog.unzufrieden': 'Unzufrieden',
        'FeedbackDialog.zufrieden': 'Zufrieden',
      };

      return translations[key] ?? key;
    },
  }),
}));

const targetRef = { id: 'target-1', node_type: 'fundstelle' as const };
const createSummary = (
  overrides: Partial<NodeSummary> & Pick<NodeSummary, 'id' | 'node_type'>,
): NodeSummary => ({
  frontend_parent_ids: [],
  parents: [],
  ...overrides,
});
const createFeedbackIndex = (feedbackId?: string) =>
  buildProjectNodeIndex([
    createSummary(targetRef),
    ...(feedbackId
      ? [
          createSummary({
            id: feedbackId,
            node_type: 'feedback',
            frontend_parent_ids: ['fundstelle:target-1'],
          }),
        ]
      : []),
  ]);
const createGraphMock = (feedbackId?: string) => {
  const index = createFeedbackIndex(feedbackId);

  return { hasNode: (nodeId: string) => hasNode(index, nodeId), index };
};
const existingFeedback = {
  id: 'feedback-1',
  node_type: 'feedback' as const,
  compositeKey: 'feedback:feedback-1',
  project_id: 'project-1',
  is_deleted: false,
  rating: 'positive' as const,
  reason: 'RESULT_CORRECT',
  text: 'old text',
  user_id: 'other-user',
  frontend_parent_ids: ['fundstelle:target-1'],
  update_type: 'manual' as const,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  sys_period: null,
};

describe('FeedbackNodeDialog', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.stubGlobal('crypto', {
      randomUUID: () => 'new-feedback-id',
    });
    mocks.deleteMock.mockReset();
    mocks.insertMock.mockReset();
    mocks.transactMock.mockClear();
    mocks.updateMock.mockReset();
    mocks.toastErrorMock.mockReset();
    mocks.sentryCaptureMock.mockReset();
    mocks.persistShouldReject = false;
    mocks.canMutateProject = true;
    mocks.useGraphMock.mockReturnValue(createGraphMock());
    mocks.useNodeMock.mockReturnValue({ data: null });
  });

  it('creates feedback only when saving a new target dialog', async () => {
    const user = userEvent.setup();

    render(
      <FeedbackNodeDialog
        initialRating="positive"
        namespace="MvpRedesign"
        targetRef={targetRef}
        onClose={vi.fn()}
      />,
    );

    expect(mocks.insertMock).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole('radio', { name: 'Ergebnis ist korrekt' }),
    );
    await user.type(screen.getByRole('textbox'), 'Details');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-feedback-id',
        node_type: 'feedback',
        payload: {
          rating: 'positive',
          reason: 'RESULT_CORRECT',
          text: 'Details',
          user_id: 'user-1',
          frontend_parent_ids: ['fundstelle:target-1'],
          update_type: 'manual',
        },
      }),
    );
    expect(mocks.insertMock.mock.calls[0]?.[0]?.payload).not.toHaveProperty(
      'project_version',
    );
    expect(mocks.insertMock.mock.calls[0]?.[0]?.payload).not.toHaveProperty(
      'sys_period',
    );
  });

  it('uses existing feedback rating when no preselected rating is provided', () => {
    mocks.useGraphMock.mockReturnValue(createGraphMock('feedback-1'));
    mocks.useNodeMock.mockReturnValue({ data: existingFeedback });

    render(
      <FeedbackNodeDialog
        initialRating={undefined}
        namespace="MvpRedesign"
        targetRef={targetRef}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Zufrieden' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Unzufrieden' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('keeps the same dialog shell while existing feedback loads', async () => {
    let resolveFeedback: () => void = () => {};
    let isFeedbackPending = true;
    const feedbackPromise = new Promise<void>((resolve) => {
      resolveFeedback = resolve;
    });

    mocks.useGraphMock.mockReturnValue(createGraphMock('feedback-1'));
    mocks.useNodeMock.mockImplementation(() => {
      if (isFeedbackPending) {
        throw feedbackPromise;
      }

      return { data: existingFeedback };
    });

    render(
      <FeedbackNodeDialog
        initialRating={undefined}
        namespace="MvpRedesign"
        targetRef={targetRef}
        onClose={vi.fn()}
      />,
    );

    const dialogBeforeLoad = screen.getByRole('dialog');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Feedback wird geladen.',
    );

    await act(async () => {
      isFeedbackPending = false;
      resolveFeedback();
      await feedbackPromise;
    });

    expect(screen.getByRole('button', { name: 'Zufrieden' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('dialog')).toBe(dialogBeforeLoad);
  });

  it('starts a new feedback dialog when an existing feedback ref no longer resolves', async () => {
    const user = userEvent.setup();
    mocks.useGraphMock.mockReturnValue(createGraphMock('stale-feedback'));
    mocks.useNodeMock.mockReturnValue({ data: null });

    render(
      <FeedbackNodeDialog
        initialRating="positive"
        namespace="MvpRedesign"
        targetRef={targetRef}
        onClose={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole('radio', { name: 'Ergebnis ist korrekt' }),
    );
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(mocks.insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'new-feedback-id',
        node_type: 'feedback',
        payload: expect.objectContaining({
          rating: 'positive',
          reason: 'RESULT_CORRECT',
          user_id: 'user-1',
          frontend_parent_ids: ['fundstelle:target-1'],
        }),
      }),
    );
    expect(mocks.updateMock).not.toHaveBeenCalled();
  });

  it('does not create or update feedback when the user cannot mutate the project', async () => {
    const user = userEvent.setup();
    mocks.canMutateProject = false;

    render(
      <FeedbackNodeDialog
        initialRating="positive"
        namespace="MvpRedesign"
        targetRef={targetRef}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.insertMock).not.toHaveBeenCalled();

    mocks.useGraphMock.mockReturnValue(createGraphMock('feedback-1'));
    mocks.useNodeMock.mockReturnValue({ data: existingFeedback });

    cleanup();
    render(
      <FeedbackNodeDialog
        initialRating={undefined}
        namespace="MvpRedesign"
        targetRef={targetRef}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.keyboard('{Enter}');
    expect(mocks.updateMock).not.toHaveBeenCalled();
    expect(mocks.deleteMock).not.toHaveBeenCalled();
  });

  it('does not open the dialog when the feedback target is missing from the graph', () => {
    mocks.useGraphMock.mockReturnValue({
      hasNode: () => false,
      index: createFeedbackIndex(),
    });

    render(
      <FeedbackNodeDialog
        initialRating="positive"
        namespace="MvpRedesign"
        targetRef={targetRef}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mocks.insertMock).not.toHaveBeenCalled();
  });

  it('keeps the dialog open and surfaces an error toast when creating feedback fails', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mocks.persistShouldReject = true;

    render(
      <FeedbackNodeDialog
        initialRating="positive"
        namespace="MvpRedesign"
        targetRef={targetRef}
        onClose={onClose}
      />,
    );

    await user.click(
      screen.getByRole('radio', { name: 'Ergebnis ist korrekt' }),
    );
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await vi.waitFor(() =>
      expect(mocks.toastErrorMock).toHaveBeenCalledWith(
        'Feedback konnte nicht gespeichert werden.',
      ),
    );
    expect(mocks.insertMock).toHaveBeenCalledTimes(1);
    expect(mocks.sentryCaptureMock).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('keeps the dialog open and surfaces an error toast when updating feedback fails', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mocks.useGraphMock.mockReturnValue(createGraphMock('feedback-1'));
    mocks.useNodeMock.mockReturnValue({ data: existingFeedback });
    mocks.persistShouldReject = true;

    render(
      <FeedbackNodeDialog
        initialRating={undefined}
        namespace="MvpRedesign"
        targetRef={targetRef}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await vi.waitFor(() =>
      expect(mocks.toastErrorMock).toHaveBeenCalledWith(
        'Feedback konnte nicht gespeichert werden.',
      ),
    );
    expect(mocks.updateMock).toHaveBeenCalledTimes(1);
    expect(mocks.sentryCaptureMock).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes immediately and surfaces an error toast when deleting feedback fails in the background', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    mocks.useGraphMock.mockReturnValue(createGraphMock('feedback-1'));
    mocks.useNodeMock.mockReturnValue({ data: existingFeedback });
    mocks.persistShouldReject = true;

    render(
      <FeedbackNodeDialog
        initialRating={undefined}
        namespace="MvpRedesign"
        targetRef={targetRef}
        onClose={onClose}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Feedback löschen' }));
    await user.click(screen.getByRole('button', { name: 'Bestätigen?' }));

    await vi.waitFor(() =>
      expect(mocks.toastErrorMock).toHaveBeenCalledWith(
        'Feedback konnte nicht gelöscht werden.',
      ),
    );
    expect(mocks.deleteMock).toHaveBeenCalledTimes(1);
    expect(mocks.sentryCaptureMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
