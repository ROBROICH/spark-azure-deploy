import type { NodePayloadByType } from '@/db/nodes/types';
import type { CompositeKey } from '@/db/nodes/compositeKey';
import { toast } from '@/features/ui/toast/Toast';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRemoveRechtsgrundlageNorm } from './useRemoveRechtsgrundlageNorm';

const {
  deleteNodeMock,
  saveNormSelectionChangesMock,
  transactMock,
  updateMock,
} = vi.hoisted(() => ({
  deleteNodeMock: vi.fn(),
  saveNormSelectionChangesMock: vi.fn(),
  transactMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({ topicName: 'topic-1', verfahrenId: 'project-1' }),
  }),
}));

vi.mock('@/features/project/versioning/projectVersioning', () => ({
  useProjectRouteVersion: () => 7,
}));

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    delete: deleteNodeMock,
    transact: transactMock,
    update: updateMock,
  }),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock(
  '../screen-content/rechtsgrundlage-dialog/saveNormSelectionChanges',
  () => ({
    saveNormSelectionChanges: saveNormSelectionChangesMock,
  }),
);

const norm = {
  compositeKey: 'norm:norm-1' as CompositeKey,
  created_at: '2026-05-14T10:00:00.000Z',
  frontend_parent_ids: ['topic_norm:topic-norm-1'],
  gesetz_id: 'gesetz-1',
  id: 'norm-1',
  is_deleted: false,
  is_outdated: false,
  node_type: 'norm',
  paragraph_nr: '44',
  paragraph_titel: null,
  project_id: 'project-1',
  project_version: 1,
  regelungsgegenstand: null,
  sys_period: null,
  text: '',
  update_type: null,
  updated_at: '2026-05-14T10:00:00.000Z',
} satisfies NodePayloadByType<'norm'>;
const gesetz = {
  compositeKey: 'gesetz:gesetz-1' as CompositeKey,
  created_at: '2026-05-14T10:00:00.000Z',
  frontend_parent_ids: [],
  id: 'gesetz-1',
  is_deleted: false,
  is_outdated: false,
  jurabk: 'BNatSchG',
  name: 'Bundesnaturschutzgesetz',
  node_type: 'gesetz',
  project_id: 'project-1',
  project_version: 1,
  sys_period: null,
  update_type: null,
  updated_at: '2026-05-14T10:00:00.000Z',
} satisfies NodePayloadByType<'gesetz'>;
const topicNorm = {
  absatz: null,
  compositeKey: 'topic_norm:topic-norm-1' as CompositeKey,
  created_at: '2026-05-14T10:00:00.000Z',
  frontend_parent_ids: ['topic:topic-1'],
  id: 'topic-norm-1',
  is_deleted: false,
  is_outdated: false,
  jurabk: 'BNatSchG',
  mvp_status: 'unchecked',
  node_type: 'topic_norm',
  nummer: null,
  paragraph_nr: '44',
  project_id: 'project-1',
  project_version: 1,
  satz: null,
  satz_statuses: {},
  sys_period: null,
  topic_id: 'topic-1',
  type: 'pruefung',
  update_type: null,
  updated_at: '2026-05-14T10:00:00.000Z',
} satisfies NodePayloadByType<'topic_norm'>;

describe('useRemoveRechtsgrundlageNorm', () => {
  beforeEach(() => {
    deleteNodeMock.mockReset();
    saveNormSelectionChangesMock.mockReset();
    saveNormSelectionChangesMock.mockResolvedValue(true);
    transactMock.mockReset();
    updateMock.mockReset();
    vi.mocked(toast.error).mockClear();
  });

  it('does nothing without mutation rights or a resolved norm', async () => {
    const { result: readOnlyResult } = renderHook(() =>
      useRemoveRechtsgrundlageNorm(false),
    );
    const { result: missingNormResult } = renderHook(() =>
      useRemoveRechtsgrundlageNorm(true),
    );

    await act(async () => {
      await readOnlyResult.current.removeNorm({
        gesetz,
        norm,
        topicNorms: [topicNorm],
      });
      await missingNormResult.current.removeNorm({
        gesetz,
        norm: null,
        topicNorms: [topicNorm],
      });
    });

    expect(saveNormSelectionChangesMock).not.toHaveBeenCalled();
  });

  it('persists the removal payload and exposes in-flight state', async () => {
    let resolveSave: (value: boolean) => void = () => undefined;
    saveNormSelectionChangesMock.mockReturnValue(
      new Promise<boolean>((resolve) => {
        resolveSave = resolve;
      }),
    );
    const { result } = renderHook(() => useRemoveRechtsgrundlageNorm(true));

    act(() => {
      void result.current.removeNorm({
        gesetz,
        norm,
        topicNorms: [topicNorm],
      });
    });

    expect(result.current.removingNormId).toBe('norm-1');
    expect(saveNormSelectionChangesMock).toHaveBeenCalledWith({
      availableNormEntries: [
        {
          gesetz,
          legalBasis: {
            jurabk: 'BNatSchG',
            paragraph_nr: '44',
          },
          norm,
          projectNorm: norm,
          selectionKey: 'bnatschg::44',
          topicNorm,
          topicNormLinks: [
            {
              norm,
              topicNorm,
            },
          ],
          topicNorms: [topicNorm],
        },
      ],
      draftModes: { 'bnatschg::44': 'remove' },
      projectId: 'project-1',
      projectVersion: 7,
      topicId: 'topic-1',
      transact: transactMock,
      update: updateMock,
      deleteNode: deleteNodeMock,
    });

    await act(async () => {
      await result.current.removeNorm({
        gesetz,
        norm,
        topicNorms: [topicNorm],
      });
    });

    expect(saveNormSelectionChangesMock).toHaveBeenCalledTimes(1);

    act(() => {
      resolveSave(true);
    });

    await waitFor(() => expect(result.current.removingNormId).toBeNull());
  });

  it('alerts and clears pending state when persistence fails', async () => {
    saveNormSelectionChangesMock.mockRejectedValue(new Error('save failed'));
    const { result } = renderHook(() => useRemoveRechtsgrundlageNorm(true));

    await act(async () => {
      await result.current.removeNorm({
        gesetz,
        norm,
        topicNorms: [topicNorm],
      });
    });

    expect(toast.error).toHaveBeenCalledWith(
      'RechtsgrundlageDialog.errors.saveFailed',
    );
    expect(result.current.removingNormId).toBeNull();
  });
});
