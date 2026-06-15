import type { ComponentProps } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RechtsgrundlageDialog } from './RechtsgrundlageDialog';

type RechtsgrundlageDialogProps = ComponentProps<typeof RechtsgrundlageDialog>;

const {
  insertMock,
  updateMock,
  deleteMock,
  transactMock,
  refetchNodeSummariesMock,
  sentryCaptureExceptionMock,
  useAvailableRechtsgrundlageDataMock,
  toastErrorMock,
} = vi.hoisted(() => ({
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  deleteMock: vi.fn(),
  transactMock: vi.fn(),
  refetchNodeSummariesMock: vi.fn(),
  sentryCaptureExceptionMock: vi.fn(),
  useAvailableRechtsgrundlageDataMock: vi.fn(),
  toastErrorMock: vi.fn(),
}));

const MOCK_AVAILABLE_NORM_ENTRIES = [
  {
    norm: {
      id: 'norm-bnatschg-44',
      gesetz_id: 'law-bnatschg',
      paragraph_nr: '44',
      paragraph_titel:
        'Vorschriften fuer besonders geschuetzte und bestimmte andere Tier- und Pflanzenarten',
      text: 'Normtext 44',
    },
    gesetz: {
      id: 'law-bnatschg',
      jurabk: 'BNatSchG',
    },
    topicNorms: [
      {
        id: 'topic-norm-bnatschg-44',
        node_type: 'topic_norm',
        jurabk: 'BNatSchG',
        paragraph_nr: '44',
        update_type: 'automated',
      },
    ],
    topicNorm: {
      id: 'topic-norm-bnatschg-44',
      node_type: 'topic_norm',
      jurabk: 'BNatSchG',
      paragraph_nr: '44',
      update_type: 'automated',
    },
  },
  {
    norm: {
      id: 'norm-bnatschg-45',
      gesetz_id: 'law-bnatschg',
      paragraph_nr: '45',
      paragraph_titel:
        'Ausnahmen; Ermaechtigung zum Erlass von Rechtsverordnungen',
      text: 'Normtext 45',
    },
    gesetz: {
      id: 'law-bnatschg',
      jurabk: 'BNatSchG',
    },
    topicNorms: [],
    topicNorm: null,
  },
  {
    norm: {
      id: 'norm-enwg-17',
      gesetz_id: 'law-enwg',
      paragraph_nr: '17',
      paragraph_titel:
        'Verfahren; Ermaechtigung zum Erlass von Rechtsverordnungen',
      text: 'Normtext 17',
    },
    gesetz: {
      id: 'law-enwg',
      jurabk: 'EnWG',
    },
    topicNorms: [],
    topicNorm: null,
  },
] as const;

const MOCK_AVAILABLE_LAW_GROUPS = [
  {
    id: 'law-bnatschg',
    gesetz: {
      id: 'law-bnatschg',
      jurabk: 'BNatSchG',
    },
    norms: MOCK_AVAILABLE_NORM_ENTRIES.slice(0, 2),
  },
  {
    id: 'law-enwg',
    gesetz: {
      id: 'law-enwg',
      jurabk: 'EnWG',
    },
    norms: MOCK_AVAILABLE_NORM_ENTRIES.slice(2),
  },
] as const;

const getNormLabel = (
  normEntry: (typeof MOCK_AVAILABLE_NORM_ENTRIES)[number],
) => {
  return `§ ${normEntry.norm.paragraph_nr} ${normEntry.norm.paragraph_titel}`;
};

const getSelectNormCheckboxLabel = (
  normEntry: (typeof MOCK_AVAILABLE_NORM_ENTRIES)[number],
) => {
  return `${getNormLabel(normEntry)} auswaehlen`;
};

const getDeselectNormCheckboxLabel = (
  normEntry: (typeof MOCK_AVAILABLE_NORM_ENTRIES)[number],
) => {
  return `Auswahl von ${getNormLabel(normEntry)} aufheben`;
};

const getSelectLawGroupCheckboxLabel = (lawGroup: string) => {
  return `Alle Normen in ${lawGroup} auswaehlen`;
};

const getDeselectLawGroupCheckboxLabel = (lawGroup: string) => {
  return `Auswahl aller Normen in ${lawGroup} aufheben`;
};

let mockSelectedNormIds = new Set<string>();
let generatedIdIndex = 0;
const NODE_SUMMARIES_REFETCH_DELAY_MS = 3000;

vi.mock('../../screen-data/useRechtsgrundlageData', () => ({
  useAvailableRechtsgrundlageData: () => useAvailableRechtsgrundlageDataMock(),
  getAvailableNormLabel: (
    normEntry: (typeof MOCK_AVAILABLE_NORM_ENTRIES)[number],
  ) => getNormLabel(normEntry),
  getAvailableNormText: (
    normEntry: (typeof MOCK_AVAILABLE_NORM_ENTRIES)[number],
  ) => normEntry.norm.text,
}));

vi.mock('@/db/nodes/hooks/useAction', () => ({
  useAction: () => ({
    insert: insertMock,
    update: updateMock,
    delete: deleteMock,
    transact: transactMock,
  }),
}));

vi.mock('@/features/ui/toast/Toast', () => ({
  toast: {
    error: toastErrorMock,
  },
}));

vi.mock('@sentry/react', () => ({
  captureException: sentryCaptureExceptionMock,
}));

vi.mock('@/features/ui/button/Button', async () => {
  const React = await import('react');

  return {
    Button: (props: {
      children: React.ReactNode;
      disabled?: boolean;
      loading?: boolean;
      onClick?: () => void;
      type?: 'button' | 'submit' | 'reset';
    }) =>
      React.createElement(
        'button',
        {
          type: props.type ?? 'button',
          disabled: props.disabled || props.loading,
          'aria-busy': props.loading ? 'true' : 'false',
          onClick: props.onClick,
        },
        props.loading
          ? [
              React.createElement('svg', {
                key: 'spinner',
                className: 'animate-spin',
              }),
              props.children,
            ]
          : props.children,
      ),
  };
});

vi.mock('@tanstack/react-router', () => ({
  getRouteApi: () => ({
    useParams: () => ({
      topicName: 'topic-1',
      verfahrenId: 'verfahren-1',
    }),
    useLoaderData: () => ({
      refetchNodeSummaries: refetchNodeSummariesMock,
    }),
  }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, unknown>) => {
      const translations = {
        'RechtsgrundlageDialog.title': 'Rechtsgrundlage',
        'RechtsgrundlageDialog.description':
          'Die Rechtsgrundlagen enthalten „Startnormen“, die im vorliegenden Thema einschlägig sein könnten. Prüfen Sie diese in Bezug auf das gegenständliche Verfahren und editieren oder ergänzen Sie weitere Normen bei Bedarf.',
        'RechtsgrundlageDialog.cancel': 'Abbrechen',
        'RechtsgrundlageDialog.save': 'Speichern',
        'RechtsgrundlageDialog.errors.missingLawReference':
          'Mindestens eine ausgewählte Norm kann ohne zugeordnetes Gesetz nicht gespeichert werden.',
        'RechtsgrundlageDialog.errors.saveFailed':
          'Änderungen konnten nicht gespeichert werden.',
      } satisfies Record<string, string>;
      if (key === 'RechtsgrundlageDialog.selectedCount') {
        return `${String(params?.count ?? 0)} ausgewaehlt`;
      }
      if (key === 'RechtsgrundlageDialog.groupCheckboxSelectAriaLabel') {
        return getSelectLawGroupCheckboxLabel(String(params?.lawGroup ?? ''));
      }
      if (key === 'RechtsgrundlageDialog.groupCheckboxDeselectAriaLabel') {
        return getDeselectLawGroupCheckboxLabel(String(params?.lawGroup ?? ''));
      }
      if (key === 'RechtsgrundlageDialog.groupCheckboxSelectHint') {
        return `Aktivierung waehlt auch ${String(params?.count ?? 0)} zugehoerige Normen aus.`;
      }
      if (key === 'RechtsgrundlageDialog.groupCheckboxDeselectHint') {
        return `Deaktivierung hebt die Auswahl von ${String(params?.count ?? 0)} zugehoerigen Normen auf.`;
      }
      if (key === 'RechtsgrundlageDialog.normCheckboxSelectAriaLabel') {
        return `${String(params?.norm ?? '')} auswaehlen`;
      }
      if (key === 'RechtsgrundlageDialog.normCheckboxDeselectAriaLabel') {
        return `Auswahl von ${String(params?.norm ?? '')} aufheben`;
      }
      if (key in translations) {
        return translations[key as keyof typeof translations];
      }

      return key;
    },
  }),
}));

vi.mock('@/features/ui/dialog/Dialog', async () => {
  const React = await import('react');

  let wasPreviouslyOpen = false;

  const MockDialog = (props: {
    open: boolean;
    onOpenChange: (value: boolean) => void;
    children: React.ReactNode;
  }) => {
    React.useEffect(() => {
      if (props.open && !wasPreviouslyOpen) {
        props.onOpenChange(true);
      }
      wasPreviouslyOpen = props.open;
    });

    return props.open
      ? React.createElement('div', { 'data-testid': 'dialog' }, props.children)
      : null;
  };

  return {
    Dialog: MockDialog,
    DialogContent: (props: { children: React.ReactNode }) =>
      React.createElement('div', null, props.children),
    DialogHeader: (props: { children: React.ReactNode }) =>
      React.createElement('div', null, props.children),
    DialogTitle: (props: { children: React.ReactNode }) =>
      React.createElement('h2', null, props.children),
    DialogDescription: (props: { children: React.ReactNode }) =>
      React.createElement('p', null, props.children),
  };
});

vi.mock('@/features/ui/accordion/Accordion', () => ({
  Accordion: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  AccordionItem: (props: { children: React.ReactNode; value: string }) => (
    <div data-value={props.value}>{props.children}</div>
  ),
  AccordionTrigger: (props: { children: React.ReactNode }) => (
    <button type="button">{props.children}</button>
  ),
  AccordionContent: (props: { children: React.ReactNode }) => (
    <div>{props.children}</div>
  ),
  AccordionChevron: () => <span />,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  mockSelectedNormIds = new Set<string>();
  generatedIdIndex = 0;
  insertMock.mockReset();
  updateMock.mockReset();
  deleteMock.mockReset();
  transactMock.mockReset();
  refetchNodeSummariesMock.mockReset();
  sentryCaptureExceptionMock.mockReset();
  toastErrorMock.mockReset();
  useAvailableRechtsgrundlageDataMock.mockReset();
  useAvailableRechtsgrundlageDataMock.mockImplementation(() => ({
    availableLawGroups: MOCK_AVAILABLE_LAW_GROUPS,
    availableNormEntries: MOCK_AVAILABLE_NORM_ENTRIES,
    selectedNormIds: mockSelectedNormIds,
  }));
  transactMock.mockImplementation((callback: () => void) => {
    callback();
    return {
      isPersisted: {
        promise: Promise.resolve(),
      },
    };
  });
  refetchNodeSummariesMock.mockResolvedValue(undefined);
  vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
    generatedIdIndex += 1;
    return `00000000-0000-4000-8000-${String(generatedIdIndex).padStart(12, '0')}`;
  });
});

const renderDialog = (overrides?: {
  canMutateTopic?: boolean;
  onOpenChange?: RechtsgrundlageDialogProps['onOpenChange'];
  selectedNormIds?: Set<string>;
}) => {
  mockSelectedNormIds = overrides?.selectedNormIds ?? new Set<string>();

  const props = {
    canMutateTopic: true,
    onOpenChange: vi.fn<RechtsgrundlageDialogProps['onOpenChange']>(),
    open: true,
    ...overrides,
  };

  const result = render(
    <RechtsgrundlageDialog
      canMutateTopic={props.canMutateTopic}
      onOpenChange={props.onOpenChange}
      open={props.open}
    />,
  );

  return {
    ...result,
    ...props,
  };
};

const mockDelayedNodeSummaryRefetchTimer = () => {
  let delayedRefetch: (() => void) | null = null;
  const originalSetTimeout = window.setTimeout.bind(window);
  const originalClearTimeout = window.clearTimeout.bind(window);
  const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation(((
    handler: TimerHandler,
    timeout?: number,
  ) => {
    if (
      timeout === NODE_SUMMARIES_REFETCH_DELAY_MS &&
      typeof handler === 'function'
    ) {
      delayedRefetch = () => {
        (handler as () => void)();
      };
      return {} as ReturnType<typeof window.setTimeout>;
    }

    return originalSetTimeout(handler, timeout);
  }) as typeof window.setTimeout);
  const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout').mockImplementation(((
    timerId?: number,
  ) => {
    if (timerId !== undefined) {
      originalClearTimeout(timerId);
    }
  }) as typeof window.clearTimeout);

  return {
    clearTimeoutSpy,
    run: async () => {
      expect(setTimeoutSpy).toHaveBeenCalledWith(
        expect.any(Function),
        NODE_SUMMARIES_REFETCH_DELAY_MS,
      );
      expect(refetchNodeSummariesMock).not.toHaveBeenCalled();

      await act(async () => {
        delayedRefetch?.();
        await Promise.resolve();
      });

      expect(refetchNodeSummariesMock).toHaveBeenCalledTimes(1);
    },
    runAndExpectFailure: async () => {
      expect(setTimeoutSpy).toHaveBeenCalledWith(
        expect.any(Function),
        NODE_SUMMARIES_REFETCH_DELAY_MS,
      );
      expect(refetchNodeSummariesMock).not.toHaveBeenCalled();

      await act(async () => {
        delayedRefetch?.();
        await Promise.resolve();
      });

      expect(refetchNodeSummariesMock).toHaveBeenCalledTimes(1);
      expect(sentryCaptureExceptionMock).toHaveBeenCalledOnce();
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Änderungen konnten nicht gespeichert werden.',
      );
    },
  };
};

describe('RechtsgrundlageDialog', () => {
  it('keeps existing linked norms checked and disabled', () => {
    const selectedNormIds = new Set<string>(['norm-bnatschg-44']);

    renderDialog({ selectedNormIds });

    const checkbox = screen.getByRole('checkbox', {
      name: getDeselectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[0]),
    });

    expect(checkbox.getAttribute('data-state')).toBe('checked');
    expect(checkbox.hasAttribute('disabled')).toBe(false);
  });

  it('toggles a new norm locally when its checkbox is clicked', async () => {
    const user = userEvent.setup();

    renderDialog();

    const checkbox = screen.getByRole('checkbox', {
      name: getSelectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
    });
    expect(checkbox.getAttribute('data-state')).toBe('unchecked');

    await user.click(checkbox);

    expect(checkbox.getAttribute('data-state')).toBe('checked');
  });

  it('describes cascade behavior on the law group checkbox for screen readers', () => {
    renderDialog();

    const groupCheckbox = screen.getByRole('checkbox', {
      name: getSelectLawGroupCheckboxLabel('BNatSchG'),
    });
    const cascadeHintId = groupCheckbox.getAttribute('aria-describedby');

    expect(cascadeHintId).toBeTruthy();

    const cascadeHint = document.getElementById(cascadeHintId ?? '');
    expect(cascadeHint?.textContent).toBe(
      'Aktivierung waehlt auch 2 zugehoerige Normen aus.',
    );
  });

  it('announces the selected norm count in a polite live region', async () => {
    const user = userEvent.setup();

    renderDialog({ selectedNormIds: new Set(['norm-bnatschg-44']) });

    const liveRegion = screen.getByText('1 ausgewaehlt', {
      selector: '.sr-only',
    });
    expect(liveRegion.getAttribute('aria-live')).toBe('polite');

    const groupCheckbox = screen.getByRole('checkbox', {
      name: getSelectLawGroupCheckboxLabel('BNatSchG'),
    });
    await user.click(groupCheckbox);

    expect(
      screen
        .getByText('2 ausgewaehlt', { selector: '.sr-only' })
        .getAttribute('aria-live'),
    ).toBe('polite');
  });

  it('selects all norms in a group when the group checkbox is clicked', async () => {
    const user = userEvent.setup();

    renderDialog({ selectedNormIds: new Set(['norm-bnatschg-44']) });

    const groupCheckbox = screen.getByRole('checkbox', {
      name: getSelectLawGroupCheckboxLabel('BNatSchG'),
    });
    await user.click(groupCheckbox);

    const existingCheckbox = screen.getByRole('checkbox', {
      name: getDeselectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[0]),
    });
    const newCheckbox = screen.getByRole('checkbox', {
      name: getDeselectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
    });

    expect(existingCheckbox.getAttribute('data-state')).toBe('checked');
    expect(newCheckbox.getAttribute('data-state')).toBe('checked');
  });

  it('unselects an existing norm locally when its checkbox is clicked', async () => {
    const user = userEvent.setup();

    renderDialog({ selectedNormIds: new Set(['norm-bnatschg-44']) });

    const checkbox = screen.getByRole('checkbox', {
      name: getDeselectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[0]),
    });
    expect(checkbox.getAttribute('data-state')).toBe('checked');

    await user.click(checkbox);

    expect(checkbox.getAttribute('data-state')).toBe('unchecked');
  });

  it('closes the dialog, inserts new topic_norm nodes, and schedules a node summary refetch for newly selected norms', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<RechtsgrundlageDialogProps['onOpenChange']>();
    renderDialog({
      onOpenChange,
      selectedNormIds: new Set(['norm-bnatschg-44']),
    });

    const newNormCheckbox = screen.getByRole('checkbox', {
      name: getSelectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
    });
    await user.click(newNormCheckbox);
    await waitFor(() => {
      expect(newNormCheckbox.getAttribute('data-state')).toBe('checked');
    });
    const delayedRefetch = mockDelayedNodeSummaryRefetchTimer();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(transactMock).toHaveBeenCalledOnce();
      expect(insertMock).toHaveBeenCalledOnce();
      expect(updateMock).toHaveBeenCalledOnce();
      expect(deleteMock).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    await delayedRefetch.run();

    expect(onOpenChange.mock.invocationCallOrder.at(-1)).toBeGreaterThan(
      transactMock.mock.invocationCallOrder.at(0) ?? 0,
    );

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000001',
        node_type: 'topic_norm',
        payload: {
          topic_id: 'topic-1',
          type: 'pruefung',
          jurabk: 'BNatSchG',
          paragraph_nr: '45',
          mvp_status: 'unchecked',
          satz_statuses: {},
          update_type: 'manual',
          frontend_parent_ids: ['topic:topic-1'],
        },
      }),
    );
    expect(insertMock.mock.calls[0]?.[0]?.payload).not.toHaveProperty(
      'project_version',
    );
    expect(insertMock.mock.calls[0]?.[0]?.payload).not.toHaveProperty(
      'sys_period',
    );
    expect(updateMock).toHaveBeenCalledWith(
      MOCK_AVAILABLE_NORM_ENTRIES[1].norm,
      expect.any(Function),
    );
  });

  it('does not persist selection changes without topic mutation rights', async () => {
    const user = userEvent.setup();
    renderDialog({ canMutateTopic: false });

    await user.click(
      screen.getByRole('checkbox', {
        name: getSelectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
      }),
    );

    const saveButton = screen.getByRole('button', { name: 'Speichern' });
    expect(saveButton.hasAttribute('disabled')).toBe(true);
    await user.click(saveButton);

    expect(transactMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(refetchNodeSummariesMock).not.toHaveBeenCalled();
  });

  it('shows a spinner in the save button while saving', async () => {
    const user = userEvent.setup();
    let resolvePersistence: (() => void) | undefined;
    transactMock.mockImplementationOnce((callback: () => void) => {
      callback();
      return {
        isPersisted: {
          promise: new Promise<void>((resolve) => {
            resolvePersistence = resolve;
          }),
        },
      };
    });
    renderDialog();

    const checkbox = screen.getByRole('checkbox', {
      name: getSelectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
    });
    await user.click(checkbox);
    await waitFor(() => {
      expect(checkbox.getAttribute('data-state')).toBe('checked');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    const saveButton = screen.getByRole('button', { name: 'Speichern' });
    expect(saveButton.getAttribute('aria-busy')).toBe('true');
    expect(saveButton.querySelector('svg.animate-spin')).not.toBeNull();

    resolvePersistence?.();
  });

  it('deletes topic_norm nodes and cleans the norm edge for removed norms', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog({
      selectedNormIds: new Set(['norm-bnatschg-44']),
    });

    const checkbox = screen.getByRole('checkbox', {
      name: getDeselectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[0]),
    });
    await user.click(checkbox);
    await waitFor(() => {
      expect(checkbox.getAttribute('data-state')).toBe('unchecked');
    });
    const delayedRefetch = mockDelayedNodeSummaryRefetchTimer();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(transactMock).toHaveBeenCalledOnce();
      expect(deleteMock).toHaveBeenCalledOnce();
      expect(updateMock).toHaveBeenCalledOnce();
      expect(insertMock).not.toHaveBeenCalled();
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    await delayedRefetch.run();

    expect(deleteMock).toHaveBeenCalledWith(
      MOCK_AVAILABLE_NORM_ENTRIES[0].topicNorm,
    );
    expect(updateMock).toHaveBeenCalledWith(
      MOCK_AVAILABLE_NORM_ENTRIES[0].norm,
      expect.any(Function),
    );
  });

  it('clears a scheduled node summary refetch when the dialog unmounts', async () => {
    const user = userEvent.setup();
    const { unmount } = renderDialog();

    const checkbox = screen.getByRole('checkbox', {
      name: getSelectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
    });
    await user.click(checkbox);
    await waitFor(() => {
      expect(checkbox.getAttribute('data-state')).toBe('checked');
    });
    const delayedRefetch = mockDelayedNodeSummaryRefetchTimer();

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(transactMock).toHaveBeenCalledOnce();
    });

    unmount();

    expect(delayedRefetch.clearTimeoutSpy).toHaveBeenCalled();
    expect(refetchNodeSummariesMock).not.toHaveBeenCalled();
  });

  it('reports delayed node summary refetch failures', async () => {
    const user = userEvent.setup();
    refetchNodeSummariesMock.mockRejectedValueOnce(new Error('refetch failed'));
    renderDialog();

    const checkbox = screen.getByRole('checkbox', {
      name: getSelectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
    });
    await user.click(checkbox);
    await waitFor(() => {
      expect(checkbox.getAttribute('data-state')).toBe('checked');
    });
    const delayedRefetch = mockDelayedNodeSummaryRefetchTimer();

    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(transactMock).toHaveBeenCalledOnce();
    });
    await delayedRefetch.runAndExpectFailure();
  });

  it('deletes every linked topic_norm when removing a norm with duplicate links', async () => {
    const user = userEvent.setup();
    useAvailableRechtsgrundlageDataMock.mockImplementation(() => ({
      availableLawGroups: MOCK_AVAILABLE_LAW_GROUPS,
      availableNormEntries: [
        {
          ...MOCK_AVAILABLE_NORM_ENTRIES[0],
          topicNorms: [
            MOCK_AVAILABLE_NORM_ENTRIES[0].topicNorm,
            {
              id: 'topic-norm-bnatschg-44-duplicate',
              node_type: 'topic_norm',
              jurabk: 'BNatSchG',
              paragraph_nr: '44',
              update_type: 'manual',
              frontend_parent_ids: ['topic:topic-1'],
            },
          ],
        },
        ...MOCK_AVAILABLE_NORM_ENTRIES.slice(1),
      ],
      selectedNormIds: new Set(['norm-bnatschg-44']),
    }));
    const { onOpenChange } = renderDialog({
      selectedNormIds: new Set(['norm-bnatschg-44']),
    });

    const checkbox = screen.getByRole('checkbox', {
      name: getDeselectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[0]),
    });
    await user.click(checkbox);
    await waitFor(() => {
      expect(checkbox.getAttribute('data-state')).toBe('unchecked');
    });
    const delayedRefetch = mockDelayedNodeSummaryRefetchTimer();
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledTimes(2);
      expect(updateMock).toHaveBeenCalledTimes(2);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    await delayedRefetch.run();
  });

  it('shows an error when persisting new norms fails', async () => {
    const user = userEvent.setup();
    transactMock.mockImplementationOnce((callback: () => void) => {
      callback();
      return {
        isPersisted: {
          promise: Promise.reject(new Error('save failed')),
        },
      };
    });
    const { onOpenChange } = renderDialog();

    await user.click(
      screen.getByRole('checkbox', {
        name: getSelectNormCheckboxLabel(MOCK_AVAILABLE_NORM_ENTRIES[1]),
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(
        'Änderungen konnten nicht gespeichert werden.',
      );
    });

    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(refetchNodeSummariesMock).not.toHaveBeenCalled();
  });

  it('shows a user-visible error when a selected norm cannot be saved without a law payload', async () => {
    const user = userEvent.setup();

    useAvailableRechtsgrundlageDataMock.mockImplementation(() => ({
      availableLawGroups: [
        {
          id: 'law-missing',
          gesetz: null,
          norms: [
            {
              norm: {
                id: 'norm-missing-law',
                gesetz_id: 'law-missing',
                paragraph_nr: '99',
                paragraph_titel: 'Norm ohne Gesetz',
                text: 'Normtext 99',
              },
              gesetz: null,
              topicNorms: [],
              topicNorm: null,
            },
          ],
        },
      ],
      availableNormEntries: [
        {
          norm: {
            id: 'norm-missing-law',
            gesetz_id: 'law-missing',
            paragraph_nr: '99',
            paragraph_titel: 'Norm ohne Gesetz',
            text: 'Normtext 99',
          },
          gesetz: null,
          topicNorms: [],
          topicNorm: null,
        },
      ],
      selectedNormIds: new Set<string>(),
    }));

    renderDialog();

    await user.click(
      screen.getByRole('checkbox', {
        name: '§ 99 Norm ohne Gesetz auswaehlen',
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(toastErrorMock).toHaveBeenCalledWith(
      'Mindestens eine ausgewählte Norm kann ohne zugeordnetes Gesetz nicht gespeichert werden.',
    );
    expect(transactMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(refetchNodeSummariesMock).not.toHaveBeenCalled();
  });

  it('closes without inserting when cancel is clicked', async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(insertMock).not.toHaveBeenCalled();
    expect(updateMock).not.toHaveBeenCalled();
    expect(deleteMock).not.toHaveBeenCalled();
    expect(refetchNodeSummariesMock).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('resets pending draft selections when reopened', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn<RechtsgrundlageDialogProps['onOpenChange']>();

    const { rerender } = render(
      <RechtsgrundlageDialog
        canMutateTopic
        onOpenChange={onOpenChange}
        open={true}
      />,
    );

    const checkboxLabel = getSelectNormCheckboxLabel(
      MOCK_AVAILABLE_NORM_ENTRIES[1],
    );
    const checkbox = screen.getByRole('checkbox', {
      name: checkboxLabel,
    });
    await user.click(checkbox);
    expect(checkbox.getAttribute('data-state')).toBe('checked');

    rerender(null);
    rerender(
      <RechtsgrundlageDialog
        canMutateTopic
        onOpenChange={onOpenChange}
        open={true}
      />,
    );

    await waitFor(() => {
      expect(
        screen
          .getByRole('checkbox', {
            name: checkboxLabel,
          })
          .getAttribute('data-state'),
      ).toBe('unchecked');
    });
  });
});
